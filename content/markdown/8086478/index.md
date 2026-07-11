---
type: markdown
title: Monte Carlo Ray Tracing
slug: "8086478"
date: 2023-09-04
updatedAt: 2026-07-11 17:51:21
tags:
  - 计算机图形学
published: true
category: computer-science
---

光线追踪算法是一种基于真实光路模拟的图形学渲染算法，相较于传统的光栅化渲染，光线追踪算法可以提供更为真实的光影效果。

本文将带领读者从零开始实现一个简单的基于蒙特卡罗采样的光线追踪渲染器，完整代码可以在 [Github传送门](https://github.com/Chty-syq/RayTracing) 上参考学习。

---

## *1. Introduction*

传统的光栅化渲染通常是由光源出发，射出一条光线，计算每个片元的着色情况，最后投影到相机的成像平面上。这样做的好处在于其流水线化的渲染，在 *GPU* 上计算速度非常快，但是它忽略了光线在物体表面来回反射的情况。

而光线追踪算法则是从相机出发，朝各像素点射出一条光线，在物体间来回弹射，直到撞上光源为止，期间通过计算光路上的颜色衰减和叠加，确定该像素的颜色。

<center><img src="/content-images/external/d4af0907e0c8453488f7eb2c4ddbb045.png" width=70%></center>

光线追踪是一个递归的过程，其算法流程如下：

1. 从相机发射一条光线到场景中
2. 计算光线与场景中物体的最近交点，根据物体材质计算光路
    - 反射材质，计算反射光线 $R_{\text{reflect}}$
    - 折射材质，根据物体折射率计算折射光线 $R_{\text{refract}}$
3. 对 $R_{\text{reflect}}, R_{\text{refract}}$ 重复执行直至以下情形
    - 达到递归深度上限
    - 遇到光源
    - 与场景中物体无交
    - 无反射与折射光线
4. 计算光路中的反射与折射损失，得到像素点颜色。

---

## *2. Camera(相机)*

首先我们根据射线的参数方程

$$f(t) = S + tV$$

定义光线类，其中 $S$ 表示射出点，$V$ 为射线的方向向量。


``` cpp
class Ray {
public:
    glm::vec3 origin;
    glm::vec3 direction;
    Ray() = default;
    Ray(const glm::vec3 origin, const glm::vec3 direction): origin(origin), direction(direction) {
        this->direction = glm::normalize(this->direction);
    }
    glm::vec3 PointAt(const float t) const {
        return origin + t * direction;
    }
};
```

与光栅化的空间变换相反，光线追踪主要在世界系下完成，因此需要将屏幕像素坐标转换为世界坐标。首先，我们把坐标为 $(x,y)$ 的像素点映射到值域 $[0,1]$ 上得到 $(u,v)$

``` cpp
float u = ((float)x + MagicRandom::Float(0, 1)) / (float)width;
float v = ((float)y + MagicRandom::Float(0, 1)) / (float)height;
```

接下来根据 $(u,v)$ 计算射线方向，我们有相机参数

- `position`: 相机位置
- `target`: 相机目标位置
- `fov`: 相机视锥角
- `aspect`: 屏幕宽高比
- `focus`: 相机焦距

根据 `position` 和 `target`，我们可以建立相机坐标系 $\vec{e}_{x},\vec{e}_{y},\vec{e}_{z}$，如图所示

<center><img src="/content-images/external/bbbfd5c47f99a92dba5bc3019b90f77a.jpg"  width=70%></center>

我们知道相机到 *viewport(成像平面)* 的距离为 `focus`，则 *viewport* 的宽高

$$h = \text{focus}\cdot\tan{\frac{\theta_{\text{fov}}}{2}}, \quad w=h\times \text{aspect}$$

如此可以计算出 *viewport* 左下角的位置

$$P_{\text{corner}} = \text{position} + \vec{e}_{x} - \frac{w}{2}\vec{e}_{y} - \frac{h}{2} \vec{e}_{z}$$

有了这些东西，我们就可以插值出 $(u,v)$ 对应的世界坐标

$$P = P_{\text{corner}} + uw\vec{e}_{y} + vh\vec{e}_{z}$$

这样我们就得到了一束光线，其射出点为 `position`，目标点为 $P$，相机类的代码如下

``` cpp
class Camera {
private:
    glm::vec3 lower_left_corner{};    //视锥左下角
    glm::vec3 horizontal{};   //视锥平面水平方向跨度
    glm::vec3 vertical{};     //视锥平面垂直方向跨度

public:
    glm::vec3 camera_pos{};
    glm::vec3 camera_front{};
    glm::vec3 camera_up{};
    glm::vec3 camera_right{};
    glm::vec3 world_up{};
    float fov{};      //视锥大小
    float aspect{};   //屏幕宽高比
    float focus{};    //焦距
    Camera() = default;
    Camera(glm::vec3 camera_pos, glm::vec3 target);
    Ray GetRay(float s, float t);
};

Camera::Camera(glm::vec3 camera_pos, glm::vec3 target): camera_pos(camera_pos) {
    this->fov = CAMERA_FOV;
    this->aspect = (float)SCREEN_WIDTH / (float)SCREEN_HEIGHT;
    this->focus = CAMERA_FOCUS;
    this->world_up = glm::vec3(0.0f, 1.0f, 0.0f);

    camera_front = glm::normalize(camera_pos - target);
    camera_right = glm::normalize(glm::cross(camera_front, world_up));
    camera_up = glm::normalize(glm::cross(camera_right, camera_front));

    float half_height = focus * tan(glm::radians(fov * 0.5f));
    float half_width = aspect * half_height;

    lower_left_corner = camera_pos - half_width * camera_right - half_height * camera_up - focus * camera_front;
    horizontal = 2.0f * half_width * camera_right;
    vertical = 2.0f * half_height * camera_up;
}

Ray Camera::GetRay(float s, float t) {
    return { camera_pos, lower_left_corner + s * horizontal + t * vertical - camera_pos };
}

```

---

## *3. Hittable Objects(物体求交)*

光线从相机射出后，需要计算与场景中物理的交点，并记录下此次求交的结果

``` cpp
struct HitRecord {
    float t;                            //射线长度
    glm::vec3 position;                 //交点位置
    glm::vec3 normal;                   //交点法向量
    glm::vec2 tex_coord;                //交点纹理坐标
    shared_ptr<Material> material;      //交点材质
};
```

我们写一个抽象类来表示支持光线求交的物体

``` cpp
class Hittable {
public:
    Hittable() = default;
    virtual ~Hittable() = default;
    virtual bool Hit(const Ray &ray, float t_min, float t_max, HitRecord &hit) const = 0;
};
```

物体求交函数 `Hit` 接受入射光线 `ray` 作为输入，求交结果 `hit` 作为输出，并返回一个 `bool` 值表示是否发生了射线碰撞。

此外我们还输入了 `t_min`, `t_max` 对射线长度进行限制，这样可以裁剪掉距离太近或太远的物体。

### *3.1. Sphere(球体)*

对于球心为 $C(c_{x},c_{y},c_{z})$，半径为 $r$ 的球体，其方程为

$$(x-c_x)^2+(y-c_y)^2+(z-c_z)^2=r^2$$

设 $P(x,y,z)$ 为射线 $P(t) = S + tV$ 上一点，代入球体方程并写成向量形式得到

$$(P-C)\cdot (P-C) = r^{2}$$

联立得到

$$||V||^{2} t^2+2(V \cdot(S-C)) t+||S-C||^{2} -r^2=0$$

这是一个一元二次方程，解之即可得到交点值。这里我们需要根据判别式讨论交点的数量，如果有两个交点，需要取 $t$ 值较小的那个。

``` cpp
class Sphere: public Hittable {
public:
    float radius;
    glm::vec3 center;
    shared_ptr<Material> material;

    Sphere(glm::vec3 center, float radius, const shared_ptr<Material>& material): center(center), radius(radius), material(material) {}
    ~Sphere() override = default;

    bool Hit(const Ray &ray, float t_min, float t_max, HitRecord &hit) const override;

private:
    glm::vec2 GetSphereUV(glm::vec3 position) const; //球上一点的纹理坐标
};

bool Sphere::Hit(const Ray &ray, float t_min, float t_max, HitRecord &hit) const {
    glm::vec3 oc = ray.origin - center;
    float a = glm::dot(ray.direction, ray.direction);
    float b = glm::dot(ray.direction, oc) * 2.0f;
    float c = glm::dot(oc, oc) - radius * radius;
    float discriminant = b * b - 4.0f * a * c;
    if (discriminant > 0) {
        float t1 = (-b - sqrt(discriminant)) / (2.0f * a);
        float t2 = (-b + sqrt(discriminant)) / (2.0f * a);
        if (t1 >= t_min && t1 <= t_max) {
            hit = {
                    .t = t1,
                    .position = ray.PointAt(t1),
                    .normal = (ray.PointAt(t1) - center) / radius,
                    .tex_coord = this->GetSphereUV(ray.PointAt(t1)),
                    .material = material
            };
            return true;
        }
        if (t2 >= t_min && t2 <= t_max) {
            hit = {
                    .t = t2,
                    .position = ray.PointAt(t2),
                    .normal = (ray.PointAt(t2) - center) / radius,
                    .tex_coord = this->GetSphereUV(ray.PointAt(t2)),
                    .material = material
            };
            return true;
        }
    }
    return false;
}
```

### *3.2. Triangle Mesh(三角网格模型)*

我们可以使用 `assimp` 库导入丰富多彩的 *mesh* 进行渲染，这里导入的过程不再赘述。

对于 *mesh* 的求交我们需要解决一个非常基础的问题，就是求三角形面片 $P_{0},P_{1},P_{2}$ 与射线 $P(t) = S+tV$的交。

我们的思路是，先计算射线与三角形所在平面的交点，然后判断这个交点是否在三角形内部。

首先我们用叉积求出平面的法向量

$$N = (P_{1}-P_{0})\times (P_{2}-P_{0})$$

根据法向量 $N$ 和平面上一点 $P_{0}$ 可以写出平面方程

$$N\cdot(P-P_{0}) = 0$$

与射线方程联立得到

$$t=-\frac{N\cdot(S-P_{0})}{N\cdot V}$$

值得注意的是，当 $N\cdot V=0$ 时，射线与平面平行，不存在交点。

接下来就是判断交点是否在三角形内部了，设

$$P = \omega_{0} P_{0} + \omega_{1}P_{1} + \omega_{2}P_{2}, \quad $$

其中 $\omega_{0} + \omega_{1} + \omega_{2}=1$，交点在内部的条件等价于 $\omega_{0}, \omega_{1}, \omega_{2}\in[0,1]$，将 $\omega_{2} = 1 - \omega_{0} - \omega_{1}$ 代入得到

$$P = P_0+\omega_1\left(P_1-P_0\right)+\omega_2\left(P_2-P_0\right)$$

记

$$\begin{aligned}
R & =P-P_0 \\
Q_1 & =P_1-P_0 \\
Q_2 & =P_2-P_0
\end{aligned}$$

则要解的方程就变成了

$$R=\omega_1 Q_1+\omega_2 Q_2$$

两边分别同时乘上 $Q_{1},Q_{2}$ 得到

$$\begin{aligned}
& R \cdot Q_1=\omega_1 Q_1^2+\omega_2\left(Q_1 \cdot Q_2\right) \\
& R \cdot Q_2=\omega_1\left(Q_1 \cdot Q_2\right)+\omega_2 Q_2^2
\end{aligned}$$

写成矩阵形式为

$$\left[\begin{array}{cc}
Q_1^2 & Q_1 \cdot Q_2 \\
Q_1 \cdot Q_2 & Q_2^2
\end{array}\right]\left[\begin{array}{l}
\omega_1 \\
\omega_2
\end{array}\right]=\left[\begin{array}{l}
R \cdot Q_1 \\
R \cdot Q_2
\end{array}\right]$$

求左边矩阵的逆即可得到

$$\left[\begin{array}{c}
\omega_1 \\
\omega_2
\end{array}\right]=\frac{1}{Q_1^2 Q_2^2-\left(Q_1 \cdot Q_2\right)^2}\left[\begin{array}{cc}
Q_2^2 & -Q_1 \cdot Q_2 \\
-Q_1 \cdot Q_2 & Q_1^2
\end{array}\right]\left[\begin{array}{l}
R \cdot Q_1 \\
R \cdot Q_2
\end{array}\right]$$

我们判断 $\omega$ 是否满足条件就行了，这些权值可以用于插值计算交点的法向量、纹理坐标等。

``` cpp
bool Mesh::HitTriangle(const Ray &ray, float t_min, float t_max, HitRecord &hit, Vertex p0, Vertex p1, Vertex p2, glm::vec3 normal) const {
    if (glm::dot(ray.direction, normal) == 0.0f)  return false;
    float t = (glm::dot(p0.position, normal) - glm::dot(ray.origin, normal)) / glm::dot(ray.direction, normal);
    if (t < t_min || t > t_max)  return false;

    auto r = ray.PointAt(t) - p0.position;
    auto q1 = p1.position - p0.position;
    auto q2 = p2.position - p0.position;
    auto q1q1 = glm::dot(q1, q1);
    auto q2q2 = glm::dot(q2, q2);
    auto q1q2 = glm::dot(q1, q2);
    float determinant = 1.0f / (q1q1 * q2q2 - q1q2 * q1q2);
    float w1 = determinant * (q2q2 * glm::dot(r, q1) - q1q2 * glm::dot(r, q2));
    float w2 = determinant * (q1q1 * glm::dot(r, q2) - q1q2 * glm::dot(r, q1));
    float w0 = 1.0f - w1 - w2;

    if (w1 < 0.0f || w2 < 0.0f || w1 + w2 > 1.0f)  return false;
    hit = {
            .t = t,
            .position = ray.PointAt(t),
            .normal = glm::normalize(p0.normal * w0 + p1.normal * w1 + p2.normal * w2),
            .tex_coord = p0.tex_coord * w0 + p1.tex_coord * w1 + p2.tex_coord * w2,
            .material = material
    };
    if (glm::dot(hit.normal, ray.direction) > 0.0f)
        hit.normal = -hit.normal;
    return true;
}
```

对于整个 *mesh* 的求交，只需要对所有三角面片求一次交，取最近的交点就行了。

``` cpp
bool Mesh::Hit(const Ray &ray, float t_min, float t_max, HitRecord &hit) const {
    bool hit_any = false;
    float t_smallest = 1e9;
    for(int i = 0; i < indices.size(); i += 3) {
        auto p0 = vertices[indices[i + 0]];
        auto p1 = vertices[indices[i + 1]];
        auto p2 = vertices[indices[i + 2]];
        auto normal = glm::normalize(glm::cross(p1.position - p0.position, p2.position - p0.position));
        HitRecord temp;
        if (this->HitTriangle(ray, t_min, t_max, temp, p0, p1, p2, normal) && temp.t < t_smallest) {
            hit = temp;
            t_smallest = temp.t;
            hit_any = true;
        }
    }
    return hit_any;
}
```

上面的方法需要枚举所有面片，复杂度是 $O(n)$，当面片数量过多时，开销巨大，而 `igl` 库提供了一种使用 *AABB* 树进行优化的方法，我们可以直接使用。

由于 `igl` 库的接口使用 `Eigen` 作为输入，我们需要把 `glm` 的东西转换过去。

``` cpp
private:
    igl::AABB<Eigen::MatrixXd, 3> tree;
    Eigen::MatrixXd V;
    Eigen::MatrixXi F;

Mesh::Mesh(){
    this->V = converter::VertexArr2Eigen(this->vertices);
    this->F = converter::IndiceArr2Eigen(this->indices);
    this->tree.init(this->V, this->F);
}

bool Mesh::Hit(const Ray &ray, float t_min, float t_max, HitRecord &hit) const {
    auto hits = vector<igl::Hit>();
    auto o = converter::Vec2Eigen(ray.origin);
    auto v = converter::Vec2Eigen(ray.direction);

    tree.intersect_ray(this->V, this->F, o, v, hits);
    std::sort(hits.begin(), hits.end(), [](auto &h1, auto &h2) { return h1.t < h2.t; });

    for(const auto& point: hits) if(point.t >= t_min && point.t <= t_max) {
        float w1 = point.u;
        float w2 = point.v;
        float w0 = 1 - w1 - w2;
        auto p0 = vertices[this->F(point.id, 0)];
        auto p1 = vertices[this->F(point.id, 1)];
        auto p2 = vertices[this->F(point.id, 2)];
        hit = {
                .t = point.t,
                .position = ray.PointAt(point.t),
                .normal = glm::normalize(p0.normal * w0 + p1.normal * w1 + p2.normal * w2),
                .tex_coord = p0.tex_coord * w0 + p1.tex_coord * w1 + p2.tex_coord * w2,
                .material = material
        };
        if (glm::dot(hit.normal, ray.direction) > 0.0f)
            hit.normal = -hit.normal;
        return true;
    }
    return false;
}

```


### *3.3. Bounding Volume Hierarchy(层次包围盒)*

当场景中有多个物体时，我们需要对每个物体都做一次射线求交，复杂度是 $O(n)$ 的，如果物体的数量过多，渲染速度将极慢无比。

为此我们需要一种叫做 *bounding volume hierarchy(层次包围盒)* 的东西来降低求交的复杂度。

对于 *hittable* 的物体，我们构建它的 *AABB* 盒，然后先判断射线与这个包围盒是否相交，如果没有则不需要对该物体求交。

对于射线 $P(t) = S + tV$，以及包围盒 $\vec{b}_{min},\vec{b}_{max}$，我们对每个方向求出射线与盒子的交点，以 $x$ 为例

$$t_{0}^{(x)} = \frac{\vec{b}_{min}^{(x)} - S^{(x)}}{V^{(x)}}, \quad t_{1}^{(x)} =  \frac{\vec{b}_{max}^{(x)} - S^{(x)}}{V^{(x)}}$$

这样我们就求出了三段区间 $[t_{0}^{(x)}, t_{1}^{(x)}], [t_{0}^{(y)}, t_{1}^{(y)}]， [t_{0}^{(z)}, t_{1}^{(z)}]$，如图所示是二维的情况

<center><img src="/content-images/external/0e249d826697ece22563cfdc2cc2bb7a.png" height=250px><img src="/content-images/external/18aff769927592f2ea6bc8d27028a59a.png" height=250px><img src="/content-images/external/9f7d9666b88991df5178919b356f6a6b.png" height=250px></center>

我们发现只要这三段区间有交集，射线与包围盒就相交。

``` cpp
class AABBBox {
public:
    glm::vec3 box_left;
    glm::vec3 box_right;
    AABBBox(glm::vec3 box_left, glm::vec3 box_right): box_left(box_left), box_right(box_right) {}
    glm::vec3 GetCenter() const {
        return (box_left + box_right) / 2.0f;
    }
    bool Hit(const Ray &ray, float t_min, float t_max);
};

bool AABBBox::Hit(const Ray &ray, float t_min, float t_max) {
    for(int i = 0; i < 3; ++i) {
        float t0 = (box_left[i] - ray.origin[i]) / ray.direction[i];
        float t1 = (box_right[i] - ray.origin[i]) / ray.direction[i];
        if (t0 > t1) {
            std::swap(t0, t1);
        }
        t_min = std::max(t_min, t0);
        t_max = std::min(t_max, t1);
    }
    return (t_min < t_max);
}
```

接下来，我们对场景中的所有物体进行划分，构建出一颗线段树

<center><img src="/content-images/external/c41f32314c2e7e56c7ea5fe9c7de2e45.png" width=70%></center>

其中叶结点表示每个物体，而非叶结点表示该区间内所有物体的包围盒，构建代码如下

``` cpp
void HittableList::BuildBVH(int node, int l, int r) {
    if (l == r) {
        bvh_tree[node] = list[l]->box;
        return;
    }
    int mid = (l + r) >> 1;
    BuildBVH(node << 1, l, mid);
    BuildBVH(node << 1 | 1, mid + 1, r);
    auto b1 = bvh_tree[node << 1];
    auto b2 = bvh_tree[node << 1 | 1];
    auto box_left = utils::EleWiseMin(b1->box_left, b2->box_left);
    auto box_right = utils::EleWiseMax(b1->box_right, b2->box_right);
    bvh_tree[node] = std::make_shared<AABBBox>(box_left, box_right);
}

void HittableList::BuildBVH() {
    std::sort(list.begin(), list.end(), [](const shared_ptr<Hittable> &h1, const shared_ptr<Hittable> &h2) {
        return h1->box->GetCenter().x < h2->box->GetCenter().x;
    });
    bvh_tree.resize(list.size() << 2);
    BuildBVH(root, 0, (int)list.size() - 1);
}
```

判断碰撞时，我们从根结点开始，如果该结点的包围盒与射线相交，就继续遍历左右儿子，直到遇上叶结点，对叶结点所表示的物体求交即可。

``` cpp
bool HittableList::Hit(const Ray &ray, float t_min, float t_max, HitRecord &hit, int node, int l, int r) const {
    if (l == r) {
        return list[l]->Hit(ray, t_min, t_max, hit);
    }
    if (bvh_tree[node]->Hit(ray, t_min, t_max)) {
        HitRecord hit0, hit1;
        int mid = (l + r) >> 1;
        bool hit_l = Hit(ray, t_min, t_max, hit0, node << 1, l, mid);
        bool hit_r = Hit(ray, t_min, t_max, hit1, node << 1 | 1, mid + 1, r);
        if (hit_l && hit_r)     hit = hit0.t < hit1.t ? hit0 : hit1;
        else if (hit_l)         hit = hit0;
        else if (hit_r)         hit = hit1;
        return (hit_l || hit_r);
    }
    return false;
}

bool HittableList::Hit(const Ray &ray, float t_min, float t_max, HitRecord &hit) const {
    return Hit(ray, t_min, t_max, hit, root, 0, (int)list.size() - 1);
}
```

---

## *4. Monte Carlo Sample(蒙特卡罗采样)*

### *4.1. Rendering Equation(渲染方程)*

阅读本节需要掌握前置技能 [*solid angle(立体角)*](http://blog.leanote.com/post/chty_syq/cd8b801b5bca)，以及光线的几条性质

- 光路是可逆的，即交换入射光线与观察方向，光路不变。
- 物体对不同颜色的光有不同的反射率 $\text{albedo}$，出射光的颜色
$$\text{Color}_{o} = \text{albedo} \times \text{Color}_{i}$$
- 光线的强度服从能量守恒定律。

按照流程，接下来我们需要根据物体的材质计算光路，并处理各种光照现象，以确定像素点的颜色。为此，我们需要首先了解渲染方程

$$L(P, \omega_{o})=\int_{\Omega} f_r(\omega_{i}, \omega_{o}) \times L(P, \omega_{i}) \cos \theta d \omega_i$$

我们来解释一下各量的含义，如图所示

<center><img src="/content-images/external/cfa3a848d052d8fe225cdf0bd0791f41.png" width=70%></center>

当光线碰撞于点 $P$ 时，会发生 *scatter(散射)* 现象，向单位半球面的各个方向散射光线，而我们关心的是观察方向 $\omega_{o}$ 的光照强度。

- $\omega_{i}$ 表示从四面八方照射进来的入射光线。
- $L(P, \omega_{i})$ 表示入射光强度。
- $L(P, \omega_{o})$ 表示出射光强度。
- $f_r(\omega_{i}, \omega_{o})$ 表示 *BRDF(双向反射分布函数)*，它描述了入射光线 $\omega_{i}$ 从 $\omega_{o}$ 方向射出的概率分布。
- $\theta$ 表示入射光线与法线的夹角，$\cos\theta$ 描述了不同方向的入射光的强度损失。

渲染方程的直观含义就是，把所有入射方向 $\omega_{i}$ 的光线所提供的光照强度在整个半球面 $\Omega$ 上做积分，就得到了出射光线 $\omega_{o}$ 的强度。

最后考虑物体的反射率 $\text{albedo}$，并将 $\cos\theta$ 合入 $f_r(\omega_{i}, \omega_{o})$ 为散射光线密度函数 $\text{pScatter}(\omega_{i}, \omega_{o})$，得到出射光线颜色的表达式

$$\text{Color}(P,\omega_{o}) = \int_{\Omega}\text{albedo} \times \text{pScatter}(\omega_{i}, \omega_{o}) \times \text{Color}(P, \omega_{i}) d \omega_i$$

初始观察方向 $\omega_{o}$ 是已知的，我们需要递归计算入射光线的颜色 $\text{Color}(P, \omega_{i})$，这就是 *path tracing(路径追踪)* 算法。

这个积分式直接计算开销巨大，我们介绍一种基于 *Monte Carlo sample(蒙特卡罗采样)* 的方法。


### *4.2. Monte Carlo Integration(蒙特卡罗积分)*

设随机变量 $X$ 服从概率分布 $p(x)$，给定关于 $X$ 的函数 $f(X)$，我们可以根据大数定律来近似 $f(X)$ 的期望

$$\mathbb{E}[f(X)]=\int_{x \in X} f(x) p(x) d x \approx \frac{1}{N} \sum_{i=1}^N f\left(x_i\right)$$

其中 $x_{1},\cdots,x_{N}$ 是从 $X$ 的概率分布 $p(x)$ 中采样得到的 $N$ 个样本点。记 $g(x) = f(x)p(x)$，则

$$I = \int_{x \in X} g(x) d x \approx \frac{1}{N} \sum_{i=1}^N \frac{g\left(x_i\right)}{p\left(x_i\right)}$$

现在我们找到了一种求任意函数 $g(x)$ 定积分近似值的方法：

1. 取任意的定义在积分域上的随机变量 $X$，设其 *pdf(概率密度函数)* 为 $p(x)$
2. 在 $p(x)$ 分布下进行随机抽样得到 $N$ 个样本点 $x_{1},\cdots,x_{N}$
3. 根据上述公式计算积分的近似值。

这就是 *Monte-Carlo integration(蒙特卡罗积分)*，我们可以计算一下积分式的期望

$$\mathbb{E}[I] = \frac{1}{N} \sum_{i=1}^N \mathbb{E}\left[\frac{g\left(x_i\right)}{p\left(x_i\right)}\right] = \frac{1}{N} N \int \frac{g(x)}{p(x)} p(x) d x=\int g(x) d x$$

我们看到 $I$ 是真实积分的一个无偏估计，而方差为

$$\operatorname{Var}(I) =\frac{1}{N}\int\left(\frac{g(x)}{p(x)}-I\right)^2 p(x) d x$$

我们希望这个方差尽可能的小，也就是说 $\frac{g(x)}{p(x)}$ 要尽可能的接近积分值 $I$，而积分值正是我们要求的东西。

由于 $I$ 是一个常量，我们常常选取拥有与被积函数 $g(x)$ 相似形状的概率分布函数 $p(x)$ 来减小方差，这种根据被积函数值来调整采样分布的方法，我们称之为 *importance sampling(重要性采样)*.

现在回到渲染方程

$$\text{Color}(P,\omega_{o}) = \int_{\Omega}\text{albedo} \times \text{pScatter}(\omega_{i}, \omega_{o}) \times \text{Color}(P, \omega_{i}) d \omega_i$$

我们对入射光线方向 $\omega_{i}\in \Omega$ 进行采样，设采样的 *pdf* 为 $p(\omega_i, \omega_0)$，则

$$\text{Color}(P,\omega_{o}) = \frac{1}{N}\sum_{k=1}^{N}\frac{\text{albedo} \times \text{pScatter}(\omega_{i}^{(k)}, \omega_{o}) \times \text{Color}(P, \omega_{i}^{(k)})}{p(\omega_{i}^{(k)}, \omega_0)} $$

我们选取采样的 *pdf* 可以是任意的，最常见的有

- 材质采样：例如取采样 *pdf* 为 $\operatorname{pScatter}\left(\omega_i, \omega_o\right)$，则 $$\text{Color}(P,\omega_{o}) = \frac{1}{N}\sum_{k=1}^{N}\text{albedo} \times \text{Color}(P, \omega_{i}^{(k)}) $$
- 光源采样：例如取采样 *pdf* 在光源方向上均匀分布。
- 复合采样：前两者结合起来。

对于某些材质的物体（例如镜面材质），它的散射光线仅有一条，因此无需采样，只需要把这条光线计算出来就行了。

我们定义表示散射结果的结构体

``` cpp
struct ScatterRecord {
    Ray ray;                //散射光线
    glm::vec3 attenuation;  //物体的颜色
    bool is_sample;         //是否采样
    shared_ptr<PDF> pdf;    //采样的概率密度函数
};
```

我们先不用关心这些东西是怎么计算的，这在下一节讲各种材质的时候会详细推导。现在可以根据渲染方程写出光线追踪的核心算法了

``` cpp
glm::vec3 Tracer::Tracing(const Ray &ray, int depth) {
    HitRecord hit;
    if (world->Hit(ray, T_MIN, T_MAX, hit)) {
        auto emitted = hit.material->Emitted(ray, hit); //光源自发光
        ScatterRecord scatter;
        if (depth < depth_limit && hit.material->Scatter(ray, hit, scatter)) {
            if (scatter.is_sample) {  //蒙特卡罗采样
                auto pdf = scatter.pdf;             //根据材质得到入射光线的pdf
                auto direction = pdf->Sample();     //根据pdf进行随机采样得到入射光线方向
                auto prob = pdf->Value(direction);  //该样本光线对应的概率值
                Ray scattered = Ray(hit.position, direction);
                return emitted + scatter.attenuation * hit.material->ScatterPDF(ray, hit, scattered) * Tracing(scattered, depth + 1) / prob; //渲染方程
            }
            else {  //不需要采样
                return emitted + scatter.attenuation * Tracing(scatter.ray, depth + 1);
            }
        }
        else return emitted;
    }
    else return bg_color;  //环境光
}
```

### *4.3. Random Sampling(随机抽样)*

我们还遗留了一个比较关键的问题，就是已知随机变量 $X\in \Omega$ 的分布 $p(x)$ 的情况下，如何对其进行随机抽象，得到样本点。

这里我们介绍一种 *inverse cumulative distribution function(逆累积分布函数)* 的方法。

取一个定义在 $[0, 1]$ 上均匀分布的随机变量 $Y$，我们知道 $X$ 的 *cdf(累积分布函数)* 满足

$$P(x \in \Omega_{0}) = \int_{\Omega_{0}} p(x) d x \in [0, 1]$$

其中 $\Omega_{0} \subset \Omega$，因此逆函数 $P^{-1}_{X}(Y)$ 与 $X$ 拥有相同的分布，我们只需要从 $Y$ 中均匀随机一个 $y_{i}$，然后就能计算出对应的

$$x_{i} = P^{-1}_{X}(y_{i})$$

---

## *5. Materials(材质)*

当光线射到物体上时，会根据物体的材质发生散射，我们需要根据材质计算光路

- 若材质需要采样，则计算采样函数 *pdf*，并进行随机抽样得到入射光线。
- 若材质不需要采样，则直接根据反射与折射计算入射光线。

对于需要采样的材质，我们定义一个 *pdf* 虚类，表示 *pdf* 需要实现采样与求概率值的功能。

``` cpp
class PDF { //概率密度函数
public:
    virtual float Value(glm::vec3 direction) const = 0;  //函数值
    virtual glm::vec3 Sample() const = 0;                //采样
};

```

接下来定义一个材质的虚类，表示材质需要实现散射的功能。

``` cpp
class Material {
public:
    Material() = default;
    virtual ~Material() = default;

    //散射
    virtual bool Scatter(const Ray &in, const HitRecord &hit, ScatterRecord &scatter) const { return false; }
    //光源自发光
    virtual glm::vec3 Emitted(const Ray &in, const HitRecord &hit) const { return glm::vec3(0.0f); }
    //散射概率分布
    virtual float ScatterPDF(const Ray &in, const HitRecord &hit, const Ray &scattered) const { return 0.0f; }
};

```

### *5.1. Lambertian Material(理想散射材质)*

*lambertian* 材质表面不吸收任何入射光，在入射点半球内的各个方向反射光线，如图所示

<center>![](/content-images/external/46093cbbcd594fd41daff8195cc0dbad.jpg)</center>

对于这种材质，我们设光线的散射分布与 $\cos\theta$ 成正比，其中 $\theta$ 表示出射光线与法线的夹角。设对应的 *pdf* 为

$$p(\omega) = C \cos\theta$$

我们知道 *pdf* 需要保证其在定义域上的（这里就是整个半球方向）积分为 $1$，即

$$\int_{\Omega} C  \cos \theta d \omega=C \int_0^{2 \pi} d \phi \int_0^{\frac{\pi}{2}} \cos \theta \sin \theta d \theta = \pi C = 1$$

得到常数 $C=\frac{1}{\pi}$，因此采样的 *pdf* 为

$$p(\omega) = \frac{\cos\theta}{\pi}$$

接下来需要根据这个 *pdf* 进行随机抽样，按照流程，先计算累积分布函数

$$P(\omega\in\Omega_{0})=\int_{\Omega_{0}} \frac{\cos \theta}{\pi} d \omega=\int_0^{2 \pi} d \phi \int_0^{\theta} \frac{\cos \theta^{'}}{\pi} \sin \theta^{'} d \theta^{'} = 1 - \cos^{2}\theta$$

这里我们将 $\cos\theta$ 看成一个整体，得到逆累积分布函数

$$\cos\theta = \sqrt{1 - P\left(\omega \in \Omega_0\right)}$$

我们取 $[0, 1]$ 上的随机变量 $r_{2}$，可以得到参数 $\theta$ 的抽样值

$$\cos\theta = \sqrt{1-r_{2}}, \quad \sin\theta = \sqrt{r_{2}}$$

对于另一参数 $\phi$，其在 $[0, 2\pi]$ 上均匀分布，直接随机一个 $[0,1]$ 上的随机数 $r_{1}$ 得到

$$\phi = 2\pi r_{1}$$

最后我们根据球坐标公式，将参数 $\theta,\phi$ 转化为笛卡尔坐标 $(x,y,z)$.

据此，我们写出采样函数的代码

``` cpp
class PDFCosine: public PDF {
private:
    glm::vec3 normal;
    shared_ptr<OrthoBases> axis;

public:
    explicit PDFCosine(glm::vec3 normal);
    float Value(glm::vec3 direction) const override;  //函数值
    glm::vec3 Sample() const override;   //采样
};

PDFCosine::PDFCosine(glm::vec3 normal): normal(normal) {
    this->axis = std::make_shared<OrthoBases>(normal);
}

float PDFCosine::Value(glm::vec3 direction) const {
    direction = glm::normalize(direction);
    float cosine = glm::dot(direction, this->normal);
    return std::max(cosine / PI, 0.0f);
}

glm::vec3 PDFCosine::Sample() const {
    float r1 = MagicRandom::Float(0, 1);
    float phi = 2.0f * PI * r1;
    float r2 = MagicRandom::Float(0, 1);
    float cos_theta = sqrt(1.0f - r2);
    float sin_theta = sqrt(r2);
    float x = cos(phi) * sin_theta;
    float y = sin(phi) * sin_theta;
    float z = cos_theta;
    return axis->GetLocal(glm::vec3(x, y, z));
}
```

这里值得注意的是，以上所有的讨论都是建立在入射点法向量为 $z$ 轴正方向的前提之上，我们需要将其变换在以真实法向量为轴建立的局部坐标系下，为了实现这个变换，我们根据法向量建立一组标准正交基，然后将之前求得的方向向量 $(x,y,z)$ 投影到该正交基下即可。

``` cpp
class OrthoBases { //正交基
public:
    glm::vec3 basis[3]{};
    explicit OrthoBases(glm::vec3 normal);
    glm::vec3 GetLocal(glm::vec3 position);
};

OrthoBases::OrthoBases(glm::vec3 normal) {
    this->basis[2] = glm::normalize(normal);
    auto world_up = (fabs(this->basis[2].x) > 0.9f) ? glm::vec3(0.0f, 1.0f, 0.0f) : glm::vec3(1.0f, 0.0f, 0.0f);
    this->basis[1] = glm::normalize(glm::cross(this->basis[2], world_up));
    this->basis[0] = glm::normalize(glm::cross(this->basis[2], this->basis[1]));
}

glm::vec3 OrthoBases::GetLocal(glm::vec3 position) {
    auto local = glm::vec3(0.0f);
    for(int i = 0; i < 3; ++i)  local += basis[i] * position[i];
    return local;
}
```

最后组合起来就是 *lambertian* 材质类

``` cpp
class Lambertian: public Material { //理想散射材质
private:
    shared_ptr<Texture> albedo;  //颜色

public:
    explicit Lambertian(glm::vec3 albedo): albedo(std::make_shared<TextureColor>(albedo)) {}
    explicit Lambertian(const shared_ptr<Texture>& albedo): albedo(albedo) {}
    ~Lambertian() override = default;

    bool Scatter(const Ray &in, const HitRecord &hit, ScatterRecord &scatter) const override;
    float ScatterPDF(const Ray &in, const HitRecord &hit, const Ray &scattered) const override;
};

bool Lambertian::Scatter(const Ray &in, const HitRecord &hit, ScatterRecord &scatter) const {
    scatter = {
            .ray = Ray(),  //散射光线由pdf采样得到，这里可以为空
            .attenuation = albedo->Sample(hit.tex_coord),
            .is_sample = true,
            .pdf = std::make_shared<PDFCosine>(hit.normal)
    };
    return true;
}

float Lambertian::ScatterPDF(const Ray &in, const HitRecord &hit, const Ray &scattered) const {
    float cosine = glm::dot(glm::normalize(scattered.direction), hit.normal);
    return std::max(cosine / PI, 0.0f);
}

```

### *5.2. Isotropic Material(各向同性材质)*

对于 *isotropic* 材质，其散射与 *lambertian* 是相似的，只不过它的散射光线在整个球面上均匀分布，其 *pdf* 为

$$p(\omega) = \frac{1}{4\pi}$$

因此我们只需要生成一个单位球内的随机向量就行了

``` cpp
static glm::vec3 UnitVector() {
    glm::vec3 position;
    do {
        position = glm::vec3(Float(0, 1), Float(0, 1), Float(0, 1)) * 2.0f - glm::vec3(1.0f);
    } while(glm::length(position) >= 1.0f);
    return position;
}
```

我们可以写出单位球内均匀分布的 *pdf* 采样类

``` cpp
class PDFSphere: public PDF {
public:
    PDFSphere() = default;
    float Value(glm::vec3 direction) const override;
    glm::vec3 Sample() const override;
};

float PDFSphere::Value(glm::vec3 direction) const {
    return 1.0f / (4.0f * PI);
}

glm::vec3 PDFSphere::Sample() const {
    return MagicRandom::UnitVector();
}
```

以及相应的 *isotropic* 材质类

``` cpp
class Isotropic: public Material {
public:
private:
    glm::vec3 albedo;

public:
    explicit Isotropic(glm::vec3 albedo): albedo(albedo) {}
    ~Isotropic() override = default;

    bool Scatter(const Ray &in, const HitRecord &hit, ScatterRecord &scatter) const override;
    float ScatterPDF(const Ray &in, const HitRecord &hit, const Ray &scattered) const override;
};

bool Isotropic::Scatter(const Ray &in, const HitRecord &hit, ScatterRecord &scatter) const {
    scatter = {
            .ray = Ray(),
            .attenuation = albedo,
            .is_sample = true,
            .pdf = std::make_shared<PDFSphere>()
    };
    return true;
}

float Isotropic::ScatterPDF(const Ray &in, const HitRecord &hit, const Ray &scattered) const {
    return 1.0f / (4.0f * PI);
}

```

### *5.3. Metal Material(镜面反射材质)*

对于 *metal* 材质，我们假设其表面仅发生镜面反射，可以根据反射定律直接确定反射光线的方向，因此不需要采样。

<center>![](/content-images/external/dbf9e25baf1466c47181cae5b75a497c.jpg)</center>

如图所示，对于入射光线 $I$ 和法线 $N$，反射光线

$$R = I - 2N\cos\theta = I-2(N \cdot I) N$$

由于 `glm` 提供了根据入射光线和法向量计算反射光线的函数 `glm::reflect()`，我们可以直接使用它。

但是有些 *metal* 材质并没有那么光滑，为此我们对求出的反射向量做一定的扰动，使反射向量在一定的波瓣内随机，波瓣越大说明金属越粗糙。

``` cpp
class Metal: public Material { //镜面反射材质
private:
    float fuzz;  //扰动半径
    glm::vec3 albedo;

public:
    Metal(glm::vec3 albedo, float fuzz): albedo(albedo), fuzz(std::min(fuzz, 1.0f)) {}
    ~Metal() override = default;

    bool Scatter(const Ray &in, const HitRecord &hit, ScatterRecord &scatter) const override;
};

bool Metal::Scatter(const Ray &in, const HitRecord &hit, ScatterRecord &scatter) const {
    scatter = {
            .ray = Ray(hit.position, glm::reflect(in.direction, hit.normal) + MagicRandom::UnitVector() * fuzz),
            .attenuation = albedo,
            .is_sample = false,
            .pdf = nullptr
    };
    return true;
}
```


### *5.4. Dielectric Material(透明折射材质)*

对于 *dielectric* 材质，例如水，玻璃和钻石等，光线照射到它们的表面时，一部分光线发生镜面反射，另一部分则是穿过物体发生折射

<center>![enter image description here](/content-images/external/26c2179b4b606cdf3d05578c6d62d693.png)</center>

折射的计算稍显复杂，如图所示，设两种材质的折射系数分别为 $\eta_{L},\eta_{T}$，入射角和折射角分别为 $\theta_{L},\theta_{T}$，根据 *Snell* 定律有

$$\eta_L \sin \theta_L=\eta_T \sin \theta_T$$

设向量 $G$ 是 $x$ 轴负方向的单位向量，则折射光线 $T$ 可以分解为

$$T = -G \sin\theta_{T} - N\cos\theta_{T}$$

另一方面，入射光线在 $x$ 轴上的投影向量为

$$\operatorname{perp}_N \mathbf{L} = L - N\cos\theta_{L}$$

且它的长度

$$||\operatorname{perp}_N \mathbf{L}|| = \sin{\theta}_{L}$$

因此可以得到

$$G = \frac{\operatorname{perp}_N}{||\operatorname{perp}_N \mathbf{L}||} = \frac{L - N\cos\theta_{L}}{\sin{\theta}_{L}}$$

带入到 $T$ 的表达式，得到

$$T = -(L - N\cos\theta_{L}) \frac{\eta_L}{\eta_T}  - N\cos\theta_{T}$$

将 $\cos\theta_{L} = N\cdot L$，以及

$$\cos\theta_{T} = \sqrt{1-\frac{\eta_L^2}{\eta_T^2}\left[1-\cos^{2}\theta_{L}\right]}$$

代入得到

$$T=\left(\frac{\eta_L}{\eta_T} N \cdot L-\sqrt{1-\frac{\eta_L^2}{\eta_T^2}\left[1-(N \cdot L)^2\right]}\right) N-\frac{\eta_L}{\eta_T} L$$

由于 `glm` 提供了折射函数 `glm::refract`，所以上面的推导我们没有必要实现一遍，可以直接调库。

值得注意的是，若 $\sin \theta_L > \frac{\eta_r}{\eta_L}$ 时，发生全反射，此时没有折射光线，`glm::refract()` 会返回零向量，此时我们应该采用反射光线。

接下来我们还要引入 *Fresnel effect(菲涅尔现象)*.

在生活中，当我们以垂直的视角观察时，任何物体或者材质表面都有一个基础反射率，但是如果以一定的角度往平面上看的时候，所有反光都会变得明显起来。

你可以自己尝试一下，用垂直的视角观察木制桌面，此时一定只有最基本的反射性，但是如果你从近乎与法线成 $90$ 度的角度观察的话反光就会变得明显的多。

这种现象因菲涅尔而闻名，并体现在了菲涅尔方程之中，菲涅尔方程是一个相当复杂的方程式，不过幸运的是菲涅尔方程可以用 *Fresnel-Schlick* 方法求得近似解

$$F_{\text {schlick }} \left(h, v, F_0\right)=F_0+\left(1-F_0\right)(1-(h \cdot v))^5$$

这里的 $F_{0}$ 由物体的折射系数得到，$h$ 是入射方向的负向量，$v$ 则是交点处的法向量。

我们将 $F_{\text {schlick }} \left(h, v, F_0\right)$ 作为采用折射光线的概率，代码如下

``` cpp
class Dielectric: public Material { //透明折射材质
private:
    float refract_idx;  //折射率

public:
    explicit Dielectric(float refract_idx): refract_idx(refract_idx) {}
    ~Dielectric() override = default;

    float schlick(float cosine) const;
    bool Scatter(const Ray &in, const HitRecord &hit, ScatterRecord &scatter) const override;
};

float Dielectric::schlick(float cosine) const { //菲涅尔现象
    float f0 = pow((1.0f - refract_idx) / (1.0f + refract_idx), 2.0f);
    return f0 + (1.0f - f0) * pow(1.0f - cosine, 5.0f);
}

bool Dielectric::Scatter(const Ray &in, const HitRecord &hit, ScatterRecord &scatter) const {
    auto ray_reflected = glm::reflect(in.direction, hit.normal); //反射光
    auto ray_refracted = glm::dot(in.direction, hit.normal) > 0.0f ? //光线由物体内部射向外部
            glm::refract(in.direction, -hit.normal, refract_idx) :
            glm::refract(in.direction, hit.normal, 1.0f / refract_idx);

    glm::vec3 direction;
    if (glm::length(ray_refracted) > 0.0f) {
        float cosine = abs(glm::dot(in.direction, hit.normal));
        float probs = schlick(cosine);
        direction = MagicRandom::Float(0, 1) < probs ? ray_reflected : ray_refracted;
    }
    else { //全反射
        direction = ray_reflected;
    }
    scatter = {
            .ray = Ray(hit.position, direction),
            .attenuation = glm::vec3(1.0f),
            .is_sample = false,
            .pdf = nullptr
    };
    return true;
}
```

---

## *6. Lighting(光源)*

发光材质是一种特殊的材质，它不反射或折射光线，而是自身发射光线。

为了实现一个光源，当我们的射线碰撞到光源材质表面时，我们直接返回光源的碰撞点的颜色，不再做折射和反射。

对于非光源物体，我们可以看成发出的光为零向量。

``` cpp
class DiffuseLight: public Material {
public:
    shared_ptr<Texture> texture;
    explicit DiffuseLight(const shared_ptr<Texture>& texture): texture(texture) {}
    glm::vec3 Emitted(const Ray &in, const HitRecord &hit) const override;
};

glm::vec3 DiffuseLight::Emitted(const Ray &in, const HitRecord &hit) const {
    auto tex_coord = hit.tex_coord;
    if (glm::dot(hit.normal, in.direction) < 0.0f)
        return texture->Sample(tex_coord);
    else
        return glm::vec3(0.0f);
}
```

对于光源物体，我们将它的材质设置为 *DiffuseLight* 即可。

在之前的讨论中，我们在物体材质表面进行采样得到入射光线，也就是说我们假设入射光线方向 $\omega_{i}$ 的概率分布仅与物体的材质有关。这样做的实际表现并不好，渲染出的图像中存在大量噪点，这是因为光线在物体间来回弹射，最终有很大的概率找不到来源。

如果面向光源进行采样，即入射光线在指向光源的方向上随机分布，那么可以很大程度的改善这个问题。

### *6.1. Quadratic Light(矩形光源)*

我们先来介绍矩形光源的例子，如图所示

<center><img src="/content-images/external/b7b8a7eeddf042fd762b6ca1bb8740f2.png" width=70%></center>

设光源面积为 $A$，入射光线在矩形内均匀分布，我们只需要在矩形内随机采点就能完成采样，则对应的 *pdf* 就是 $\frac{1}{A}$，对应的微元为 $dA$.

但是在渲染方程里，我们采样的微元是立体角 $d\omega$，需要进行转换。还记得在讲立体角时，有公式

$$d\omega = \frac{d A_{\perp}}{\|\vec{r}\|^2} = \frac{\cos\alpha d A}{\|\vec{r}\|^2}$$

其中 $\vec{r}$ 为碰撞点指向光源采样点的向量，$\alpha$ 为矩形平面投影到 $\vec{r}$ 方向的夹角，即 

$$\cos\alpha = \vec{r}\cdot N $$

其中 $N$ 为光源法向量。我们按照两种微元进行积分得到的结果应该相同，因此

$$p(\omega)d\omega = \frac{dA}{A}$$

因此微元为立体角时的 *pdf* 为

$$p(\omega) = \frac{\|\vec{r}\|^2}{A\cos\alpha}$$

与其它材质的采样不同，光源采样依赖于碰撞点 $P$ 的位置，因此不能直接继承 `PDF` 虚类，我们先将其写在光源物体类中，参考代码如下：

``` cpp
class LightQuad: public Mesh {
private:
    float width;
    float height;

public:
    LightQuad(const shared_ptr<Material>& material, Transformation transformation);
    ~LightQuad() override = default;
    float PDFValue(glm::vec3 origin, glm::vec3 v) const override;
    glm::vec3 Random(glm::vec3 origin) const override;
};

LightQuad::LightQuad(const shared_ptr<Material>& material, Transformation transformation): Mesh(MESH_PATH, material, transformation) {
    this->width = transformation.size[0] * 2.0f;
    this->height = transformation.size[2] * 2.0f;
}

glm::vec3 LightQuad::Random(glm::vec3 origin) const {
    auto center = transformation.position;
    auto point = center + glm::vec3(MagicRandom::Float(-0.5, 0.5) * width, 0.0f, MagicRandom::Float(-0.5, 0.5) * height);
    return point - origin;
}

float LightQuad::PDFValue(glm::vec3 origin, glm::vec3 v) const {
    HitRecord hit;
    Ray ray(origin, v);
    if (this->Hit(ray, T_MIN, T_MAX, hit)) {
        float area = width * height;
        float cosine = fabs(glm::dot(hit.normal, v)) / glm::length(v);
        return glm::dot(v, v) / (area * cosine);
    }
    return 0.0f;
}
```

之后，我们再包装一层 `PDFHittable` 作为光源专属的 *pdf* 类。

``` cpp
class PDFHittable: public PDF {
private:
    shared_ptr<Hittable> hittable;
    glm::vec3 origin;
public:
    PDFHittable(const shared_ptr<Hittable> &hittable, glm::vec3 origin): hittable(hittable), origin(origin) {}
    float Value(glm::vec3 direction) const override {
        return hittable->PDFValue(origin, direction);
    };
    glm::vec3 Sample() const override {
        return hittable->Random(origin);
    };
};

```

### *6.2. Sphere Light(球体光源)*

现在我们考虑对球体光源采样，如图所示

<center><img src="/content-images/external/035ad22f75bf7903bfd610cc637cc8d2.png" width=70%></center>

球心为 $C$，半径为 $R$，碰撞点为 $P$，我们从物体表面上的一点望向一个球形区域光源，能够看到的区域就是要做采样的区域，采样方法依然是围绕 $\theta,\phi$ 展开。

显然方位角 $\phi\in [0, 2\pi]$ 均匀分布，而俯仰角 $\theta$ 存在一个上确界 $\theta_{max}$，且

$$\cos \left(\theta_{max }\right)=\sqrt{1-\frac{R^2}{\|C-P\|^2}}$$

在[立体角](http://blog.leanote.com/post/chty_syq/cd8b801b5bca)一文中，我们知道球冠对应的立体角和圆锥面是一样的，为

$$\Omega = 2 \pi(1-\cos \theta_{max})$$

因此采样的 *pdf* 为

$$p(\omega) = \frac{1}{\Omega} = \frac{1}{2 \pi(1-\cos \theta_{max})}$$

按照流程我们计算累积分布函数

$$P(\omega\in \Omega_{0}) = \int_0^{2 \pi} d \phi \int_0^\theta p(\omega) \sin t d t = \frac{1-\cos\theta}{1-\cos\theta_{max}}$$

还是将 $\cos\theta$ 看成整体，得到逆函数

$$\cos\theta = 1 - (1-\cos\theta_{max})P(\omega\in \Omega_{0})$$

取 $[0,1]$ 上均匀分布的随机数 $r_{2}$，得到样本点

$$\cos (\theta)=1+r_2\left(\cos \left(\theta_{\max }\right)-1\right)$$

以上讨论是建立在 $PC$ 方向沿 $z$ 轴正方向的前提下进行的，因为这样我们的 $\phi$ 才会在 $[0,2\pi]$ 上均匀分布，需要将采样得到的光线投影到以 $PC$ 为轴建立的标准正交基下。参考代码

``` cpp
class LightSphere: public Sphere {
public:
    using Sphere::Sphere;

    float PDFValue(glm::vec3 origin, glm::vec3 v) const override;
    glm::vec3 Random(glm::vec3 origin) const override;
};

float LightSphere::PDFValue(glm::vec3 origin, glm::vec3 v) const {
    HitRecord hit;
    if (this->Hit(Ray(origin, v), T_MIN, T_MAX, hit)) {
        auto oc = this->center - origin;
        float cos_theta_max = sqrt(1.0f - pow(radius, 2.0f) / glm::dot(oc, oc));
        float omega = 2.0f * PI * (1 - cos_theta_max);
        return 1.0f / omega;
    }
    return 0.0f;
}

glm::vec3 LightSphere::Random(glm::vec3 origin) const {
    auto oc = this->center - origin;
    float r1 = MagicRandom::Float(0, 1);
    float phi = 2.0f * PI * r1;
    float r2 = MagicRandom::Float(0, 1);

    float cos_theta_max = sqrt(1.0f - pow(radius, 2.0f) / glm::dot(oc, oc));
    float cos_theta = 1.0f + r2 * (cos_theta_max - 1.0f);
    float sin_theta = sqrt(1 - pow(cos_theta, 2.0f));

    float x = cos(phi) * sin_theta;
    float y = sin(phi) * sin_theta;
    float z = cos_theta;

    OrthoBases bases(oc);
    return bases.GetLocal(glm::vec3(x, y, z));
}
```


### *6.3. Multiple Lights(多光源)*

对于多个光源，我们等概率的选取其中一个进行采样，根据全概率公式，采样的 *pdf* 为

$$p(\omega) = \frac{1}{N}\sum_{i=1}^{N}p_{i}(\omega)$$

我们直接对所有的光源物体构建一个 `HittableList`，代码如下

``` cpp
class HittableList: public Hittable {
public:
    vector<shared_ptr<Hittable>> list;
    vector<shared_ptr<AABBBox>> bvh_tree;

    HittableList() = default;
    ~HittableList() override = default;

    void AddHittable(const shared_ptr<Hittable>& hittable);

    void BuildBVH();
    void Clear();
    bool Empty() const;

    bool Hit(const Ray &ray, float t_min, float t_max, HitRecord &hit) const override;
    void GetAABBBox() override {};

private:
    int root = 1;
    bool Hit(const Ray &ray, float t_min, float t_max, HitRecord &hit, int node, int l, int r) const;
    void BuildBVH(int node, int left, int right);

    float PDFValue(glm::vec3 origin, glm::vec3 v) const override;
    glm::vec3 Random(glm::vec3 origin) const override;
};

float HittableList::PDFValue(glm::vec3 origin, glm::vec3 v) const {
    float sum = 0.0f;
    for(const auto &hittable: list) {
        sum += hittable->PDFValue(origin, v);
    }
    return sum / (float)list.size();
}

glm::vec3 HittableList::Random(glm::vec3 origin) const {
    int index = static_cast<int>(MagicRandom::Float(0, 0.99) * (float)list.size());
    return list[index]->Random(origin);
}

```


### *6.4. Mixed sampling(混合采样)*

如果使用光源采样，因为物体表面几乎是镜面的，所以除了沿镜面反射光方向 $\omega_{i}$，大部分光源上的采样对在最终的光照贡献都为0，因此估计的方差会非常大。

而如果对物体表面材质采样，那么对于小面积光源，依然会导致很大的方差。

<center>![](/content-images/external/efb5be1a9e3c67a0cf367b470ca69017.png)</center>

因此，我们通常将这两种采样方式混合使用，从而降低估算的方差。设材质采样的权重为 $w$，则根据全概率公式，混合采样的 *pdf* 为

$$p(\omega) = wp_{M}(\omega) + (1-w)p_{L}(\omega)$$

参考代码如下：

``` cpp
class PDFMixture: public PDF {
private:
    shared_ptr<PDF> pdfs[2];
    float weight;
public:
    PDFMixture(const shared_ptr<PDF> &p0, const shared_ptr<PDF> &p1, float weight = 0.5f): weight(weight) {
        this->pdfs[0] = p0;
        this->pdfs[1] = p1;
    }
    float Value(glm::vec3 direction) const override;
    glm::vec3 Sample() const override;
};

float PDFMixture::Value(glm::vec3 direction) const {
    return weight * pdfs[0]->Value(direction) + (1 - weight) * pdfs[1]->Value(direction);
}

glm::vec3 PDFMixture::Sample() const {
    return (MagicRandom::Float(0, 1) < weight) ? pdfs[0]->Sample() : pdfs[1]->Sample();
}
```

现在光线追踪的核心代码就是

``` cpp
glm::vec3 Tracer::Tracing(const Ray &ray, int depth) {
    HitRecord hit;
    if (world->Hit(ray, T_MIN, T_MAX, hit)) {
        auto emitted = hit.material->Emitted(ray, hit); //光源自发光
        ScatterRecord scatter;
        if (depth < depth_limit && hit.material->Scatter(ray, hit, scatter)) {
            if (scatter.is_sample) {  //蒙特卡罗采样
                auto pdf = lights->Empty() ? scatter.pdf :  //没有光源则仅从材质采样
                        std::make_shared<PDFMixture>(scatter.pdf, std::make_shared<PDFHittable>(lights, hit.position));  //有光源则混合采样

                auto direction = pdf->Sample();
                auto prob = pdf->Value(direction);
                Ray scattered = Ray(hit.position, direction);
                return emitted + scatter.attenuation * hit.material->ScatterPDF(ray, hit, scattered) * Tracing(scattered, depth + 1) / prob;
            }
            else {  //不采样
                return emitted + scatter.attenuation * Tracing(scatter.ray, depth + 1);
            }
        }
        else return emitted;
    }
    else return bg_color;
}

```

---

## *7. Texture(纹理)*

为了丰富物体表面的细节，通常使用纹理映射物体的颜色，这里我们写一个 `Texture` 虚类来做这件事

``` cpp
class Texture {
public:
    Texture() = default;
    virtual ~Texture() = default;
    virtual glm::vec3 Sample(glm::vec2 tex_coord) const = 0;  //根据纹理坐标返回颜色值
};

```

对于图片纹理，我们使用 `stbi` 库来加载图片，并根据纹理坐标计算该点颜色。这里我们实现了 *clamp* 的环绕方式，即越界取边界。

``` cpp
class TextureImage: public Texture {
private:
    int width{}, height{}, channel{};
    unsigned char* bytes{};
public:
    TextureImage() = default;
    explicit TextureImage(const std::string &path);
    ~TextureImage() override = default;

    glm::vec3 Sample(glm::vec2 tex_coord) const override;
};

TextureImage::TextureImage(const std::string &path) {
    bytes = stbi_load(path.c_str(), &width, &height, &channel, 0);
    if (bytes == nullptr) {
        throw std::runtime_error("Unexpected behavior loading from " + path);
    }
}

glm::vec3 TextureImage::Sample(glm::vec2 tex_coord) const {
    int row = (int)(tex_coord.x * (float)width);
    int col = (int)(tex_coord.y * (float)height);
    row = std::min(std::max(row, 0), width - 1);
    col = std::min(std::max(col, 0), height - 1);
    int index = (col * width + row) * channel;
    float r = (float)(bytes[index + 0]) / 255.0f;
    float g = (float)(bytes[index + 1]) / 255.0f;
    float b = (float)(bytes[index + 2]) / 255.0f;
    return { r, g, b };
}

```

对于纯色纹理，那就更简单了，直接指定颜色就行了

``` cpp
class TextureColor: public Texture {
private:
    glm::vec3 color{};
public:
    TextureColor() = default;
    explicit TextureColor(glm::vec3 color): color(color) {}
    ~TextureColor() override = default;

    glm::vec3 Sample(glm::vec2 tex_coord) const override;
};

glm::vec3 TextureColor::Sample(glm::vec2 tex_coord) const {
    return color;
}
```

---

## *8. Other Graphics(其它图形)*

### *8.1. Circles(圆)*

对于圆心为 $C(c_{x},c_{y},c_{z})$，半径为 $r$，法向量为 $N$ 的空间圆盘，我们建立一组正交基于其上 $\vec{a},\vec{b},N$，则参数方程为

$$P = C + r(\vec{a}\sin\theta + \vec{b}\cos\theta)$$

首先是碰撞，我们建立 *AABB* 包围盒，盒子的大小取决于圆盘上点 $P$ 的坐标范围，以 $x$ 方向为例，借助辅助角公式有

$$P_{x} = C_{x} + r \sqrt{a_{x}^{2} + b_{x}^{2}} \sin(\theta + \phi), \quad \phi = \arctan{\frac{b_{x}}{a_{x}}}$$

因此包围盒在 $x$ 方向上的范围就是 $[ C_{x} - r \sqrt{a_{x}^{2} + b_{x}^{2}},  C_{x} + r \sqrt{a_{x}^{2} + b_{x}^{2}}]$.

求碰撞点的方法和三角面片类似，先求与平面的交点，然后判断与 $C$ 的距离是否不大于 $r$ 即可。

``` cpp
class Circle: public Hittable {
public:
    float radius;
    glm::vec3 center;
    glm::vec3 normal{};
    shared_ptr<Material> material;

    Circle(glm::vec3 center, float radius, glm::vec3 normal, const shared_ptr<Material>& material): center(center), radius(radius), material(material){
        this->normal = glm::normalize(normal);
        this->axis = std::make_shared<OrthoBases>(normal);
    }
    ~Circle() override = default;

    bool Hit(const Ray &ray, float t_min, float t_max, HitRecord &hit) const override;
    void GetAABBBox() override;

protected:
    shared_ptr<OrthoBases> axis;
    glm::vec2 GetCircleUV(glm::vec3 position) const; //圆上一点的纹理坐标
};

bool Circle::Hit(const Ray &ray, float t_min, float t_max, HitRecord &hit) const {
    if (glm::dot(ray.direction, normal) == 0.0f)  return false;
    float t = (glm::dot(center, normal) - glm::dot(ray.origin, normal)) / glm::dot(ray.direction, normal);
    if (t < t_min || t > t_max)  return false;
    auto p = ray.PointAt(t);
    if (glm::length(p - center) > radius) return false;
    hit = {
            .t = t,
            .position = p,
            .normal = normal,
            .tex_coord = this->GetCircleUV(p),
            .material = material
    };
    return true;
}

void Circle::GetAABBBox() {
    auto a = this->axis->basis[0];
    auto b = this->axis->basis[1];
    auto factor = sqrt(a * a + b * b);
    this->box = std::make_shared<AABBBox>(center - radius * factor, center + radius * factor);
}

glm::vec2 Circle::GetCircleUV(glm::vec3 position) const {
    auto local = (this->axis->GetLocal(position - center) / radius + 1.0f) * 0.5f;
    return { local.x, local.z };
}
```

对于圆盘光源的采样，我们只需要在圆盘上均匀采点即可，如果直接采样 $\theta, r$ 的话，会导致采样点不均匀，这是因为极坐标微元的面积

$$dS = r dr d\theta$$

我们的目标是均匀采样 $dS$，那么就要均匀采样半径的平方。至于 *pdf*，它的计算方法与矩形光源是一样的。

``` cpp
float LightCircle::PDFValue(glm::vec3 origin, glm::vec3 v) const {
    HitRecord hit;
    Ray ray(origin, v);
    if (this->Hit(ray, T_MIN, T_MAX, hit)) {
        float area = PI * pow(radius, 2.0f);
        float cosine = fabs(glm::dot(hit.normal, v)) / glm::length(v);
        return glm::dot(v, v) / (area * cosine);
    }
    return 0.0f;
}

glm::vec3 LightCircle::Random(glm::vec3 origin) const {
    float theta = MagicRandom::Float(0, 2.0f * PI);
    float r = sqrt(MagicRandom::Float(0, pow(radius, 2.0f)));
    auto point = center + r * (axis->basis[0] * sin(theta) + axis->basis[1] * cos(theta));
    return point - origin;
}

```

### *8.2. Cylinder and Cone(圆柱与圆锥)*

对于下底面圆心为 $C(c_{x},c_{y},c_{z})$，半径为 $R$，高度为 $H$，法向量为 $N$ 的圆柱体，我们建立一组正交基于其上 $\vec{a},\vec{b},N$，则参数方程为

$$P = C + R(\vec{a}\sin\theta + \vec{b}\cos\theta) + hN, \quad h \in [0, H]$$

根据参数方程，我们可以求出圆柱的包围盒，方法和圆面是一样的。

``` cpp
void CylinderFace::GetAABBBox() {
    auto a = this->axis->basis[0];
    auto b = this->axis->basis[1];
    auto factor = sqrt(a * a + b * b);
    auto box_left = utils::EleWiseMin(center - radius * factor, center + normal * height - radius * factor);
    auto box_right = utils::EleWiseMax(center + radius * factor, center + normal * height + radius * factor);
    this->box = std::make_shared<AABBBox>(box_left, box_right);
}
```

对于圆锥面上的一点 $P$，我们把它投影到底部圆面上，得到

$$P^{'} = (PC\cdot \vec{a}, PC\cdot \vec{b})$$

则 $P^{'}$ 需要满足 $||P^{'}|| = R$，即

$$(PC\cdot \vec{a})^{2} + (PC\cdot \vec{b})^{2} = R^{2}$$

与射线方程 $P = S + tV$ 联立得到

$$ \left[(V\cdot \vec{a})^{2} + (V\cdot \vec{b})^{2}\right]t^{2} + 2 \left[(SC\cdot \vec{a})(V\cdot \vec{a}) + (SC\cdot \vec{b})(V\cdot \vec{b})\right]t + (SC\cdot \vec{a})^{2} + (SC\cdot \vec{b})^{2} = R^{2}$$

这是一个二次方程，可以解出 $t$ 的值，最后还需要判断 $h = PC\cdot N$ 是否在 $[0,H]$ 范围内。

``` cpp
bool CylinderFace::Hit(const Ray &ray, float t_min, float t_max, HitRecord &hit) const {
    auto oc = ray.origin - center;
    float oc_dot_a = glm::dot(oc, this->axis->basis[0]);
    float oc_dot_b = glm::dot(oc, this->axis->basis[1]);
    float v_dot_a = glm::dot(ray.direction, this->axis->basis[0]);
    float v_dot_b = glm::dot(ray.direction, this->axis->basis[1]);
    float A = pow(v_dot_a, 2.0f) + pow(v_dot_b, 2.0f);
    float B = 2.0f * (oc_dot_a * v_dot_a + oc_dot_b * v_dot_b);
    float C = pow(oc_dot_a, 2.0f) + pow(oc_dot_b, 2.0f) - pow(radius, 2.0f);
    if (A == 0)  return false; //光线与法向平行

    vector<double> roots;
    equation::SolveQuadraticReal({A, B, C}, roots);
    std::sort(roots.begin(), roots.end());
    for(const auto &t: roots) if(t >= t_min && t <= t_max) {
        auto point = ray.PointAt((float)t);
        auto h = glm::dot(point - center, normal);
        if (h >= 0 && h <= height) {
            hit = {
                    .t = (float)t,
                    .position = point,
                    .normal = glm::normalize(point - center - h * normal),
                    .tex_coord = this->GetCylinderFaceUV(point),
                    .material = material
            };
            return true;
        }
    }
    return false;
}
```

对于圆锥，不同的地方只在于映射点 $P^{'}$ 与圆心的距离，应该由相似三角形求得

$$\frac{H - PC\cdot N}{H} = \frac{r}{R}$$

二次方程的右边不再是 $R^{2}$，而是

$$r^{2} = \frac{R^2}{H^2}\left\{ (V\cdot N)^{2}t^{2} - 2(V\cdot N)(H - SC \cdot N)t + (H - SC \cdot N)^{2} \right\}$$

``` cpp
bool ConeFace::Hit(const Ray &ray, float t_min, float t_max, HitRecord &hit) const {
    auto oc = ray.origin - center;
    float oc_dot_a = glm::dot(oc, this->axis->basis[0]);
    float oc_dot_b = glm::dot(oc, this->axis->basis[1]);
    float oc_dot_n = glm::dot(oc, normal);
    float v_dot_a = glm::dot(ray.direction, this->axis->basis[0]);
    float v_dot_b = glm::dot(ray.direction, this->axis->basis[1]);
    float v_dot_n = glm::dot(ray.direction, normal);
    float r2_div_h2 = pow(radius, 2.0f) / pow(height, 2.0f);
    float A = pow(v_dot_a, 2.0f) + pow(v_dot_b, 2.0f) - r2_div_h2 * pow(v_dot_n, 2.0f);
    float B = 2.0f * (oc_dot_a * v_dot_a + oc_dot_b * v_dot_b + r2_div_h2 * v_dot_n * (height - oc_dot_n));
    float C = pow(oc_dot_a, 2.0f) + pow(oc_dot_b, 2.0f) - r2_div_h2 * pow(height - oc_dot_n, 2.0f);
    if (A == 0)  return false; //光线沿着母线方向

    vector<double> roots;
    equation::SolveQuadraticReal({A, B, C}, roots);
    std::sort(roots.begin(), roots.end());
    for(const auto &t: roots) if(t >= t_min && t <= t_max) {
        auto point = ray.PointAt((float)t);
        auto h = glm::dot(point - center, normal);
        if (h >= 0 && h <= height) {
            hit = {
                    .t = (float)t,
                    .position = point,
                    .normal = glm::normalize(point - center - h * normal),
                    .tex_coord = this->GetConeFaceUV(point),
                    .material = material
            };
            return true;
        }
    }
    return false;
}
```

完整的圆柱需要圆柱面加上下两个圆面，圆锥也是一样，因此我们用 `HittableList` 来表达完整的圆柱

``` cpp
class Cylinder: public HittableList { //圆柱
public:
    float radius;
    float height;
    glm::vec3 center;
    glm::vec3 normal{};
    shared_ptr<Material> material;

    shared_ptr<CylinderFace> cylinder_face;
    shared_ptr<Circle> circle[2];

    Cylinder(glm::vec3 center, float radius, float height, glm::vec3 normal, const shared_ptr<Material>& material): center(center), radius(radius), height(height), material(material){
        this->normal = glm::normalize(normal);
        this->cylinder_face = std::make_shared<CylinderFace>(center, radius, height, this->normal, material);
        this->circle[0] = std::make_shared<Circle>(center, radius, -this->normal, material);
        this->circle[1] = std::make_shared<Circle>(center + this->normal * height, radius, this->normal, material);
        this->AddHittable(cylinder_face);
        this->AddHittable(circle[0]);
        this->AddHittable(circle[1]);
        this->box = cylinder_face->box;
        this->BuildBVH();
    }
    ~Cylinder() override = default;
};
```

### *8.3. Torus(环面)*

换面可以视作一个半径为 $r$ 的球体绕一点 $C$，沿轴 $N$ 进行旋转得到的三维图形。

<center><img src="/content-images/external/04f318cc4893191d914b112816ae95a9.png" width=30%></center>

对于以 $C(c_{x},c_{y},c_{z})$ 为中心，圆管半径(球半径)为 $r$，管面圆心到中心的距离(旋转半径)为 $R$，法向量(旋转轴)为 $N$ 的环面，我们建立一组正交基于其上 $\vec{a},\vec{b},N$.

对于以 $z$ 轴为法向量的环面，其方程为

$$\left(R-\sqrt{x^2+y^2}\right)^2+z^2=r^2$$

我们不喜欢带根号的东西，变换一下得到

$$\left(x^2+y^2+z^2 + R^2 - r^2\right)^{2} = 4R^{2}(x^{2}+y^{2})$$

因此对于环面上一点 $P$，我们把它变换到局部坐标系中得到

$$P^{'} = (PC\cdot \vec{a}, PC\cdot \vec{b}, PC\cdot N)$$

它需要满足上面的环面方程，将其与射线方程 $P = S + tV$ 联立得到（注意$x^2+y^2+z^2=||P^{'}C||^{2}$）

$$\begin{aligned}
LHS& = t^{4} + 4(SC\cdot V)t^{3} + \left[ 4(SC\cdot V)^{2}+2F \right]t^{2} + 4F(SC\cdot V)t + F^{2} \\
RHS& = 4R^{2}\left\{ \left[(V\cdot \vec{a})^{2} + (V\cdot \vec{b})^{2}\right]t^{2} +  (SC\cdot \vec{a})^{2} + (SC\cdot \vec{b})^{2}\right\}
\end{aligned}$$

其中 $F = R^2-r^2 + ||SC||^{2}$，这是一个四次方程，解之可得对应的 $t$ 值。

至于四次方程的求解方法，可以参考 [Quartic Equation](http://blog.leanote.com/post/chty_syq/Quartic-Equation)

值得注意的是，如果光源 $S$ 距离环面过远，会导致四次方程的系数偏大，方程的求解误差很大，渲染效果很差。因此我们可以将光源移动到较近的位置来修正它。

``` cpp
bool Torus::Hit(const Ray &ray, float t_min, float t_max, HitRecord &hit) const {
    auto origin = ray.origin;
    auto distance = glm::dot(center - ray.origin, ray.direction);
    auto diff = 0.0f;
    if (distance > radius + radius_cube) {
        origin += (distance - radius - radius_cube) * ray.direction;
        diff = (distance - radius - radius_cube);
    }
    auto oc = origin - center;
    auto oc_dot_v = glm::dot(oc, ray.direction);
    auto oc_dot_a = glm::dot(oc, axis->basis[0]);
    auto oc_dot_b = glm::dot(oc, axis->basis[1]);
    auto v_dot_a = glm::dot(ray.direction, axis->basis[0]);
    auto v_dot_b = glm::dot(ray.direction, axis->basis[1]);
    auto R2 = pow(radius, 2.0f);
    auto factor = pow(radius, 2.0f) - pow(radius_cube, 2.0f) + glm::dot(oc, oc);

    const double A = 1.0f;
    const double B = 4.0f * oc_dot_v;
    const double C = 4.0f * pow(oc_dot_v, 2.0f) + 2.0f * factor - 4 * R2 * (pow(v_dot_a, 2.0f) + pow(v_dot_b, 2.0f));
    const double D = 4.0f * oc_dot_v * factor - 8.0f * R2 * (v_dot_a * oc_dot_a + v_dot_b * oc_dot_b);
    const double E = pow(factor, 2.0f) - 4.0f * R2 * (pow(oc_dot_a, 2.0f) + pow(oc_dot_b, 2.0f));

    vector<double> roots;
    equation::SolveQuarticReal({ A, B, C, D, E }, roots);
    std::sort(roots.begin(), roots.end());
    for(const auto &root : roots) {
        auto t = (float)root + diff;
        if (t >= t_min && t <= t_max) {
            auto point = ray.PointAt(float(t));
            auto local = this->axis->GetLocal(point - center);
            auto direction = glm::normalize(glm::vec3(local.x, local.y, 0.0f));
            auto center_cube = this->axis->GetWorld(direction * radius) + center;
            hit = {
                    .t = (float) t,
                    .position = point,
                    .normal = glm::normalize(point - center_cube),
                    .tex_coord = this->GetTorusUV(point),
                    .material = material
            };
            return true;
        }
    }
    return false;
}
```


---

## *9. Rendering(渲染)*

对于每个像素点，我们在这个像素点单位正方形中随机选取 $N=100$ 条光线发射出去，求其平均值作为该像素点的颜色，并使用了系数 $\gamma = 2.0$ 进行 *gamma* 校正。

由于每个像素点之间是没有联系的，一个像素的着色值与其周围的像素无关，所以像素的着色计算是可以并行加速的，我们使用 `tbb` 库进行并行优化。

``` cpp
void Tracer::Render() {
    tbb::parallel_for(tbb::blocked_range<int>(0, height * width, 692), [&](tbb::blocked_range<int>& r) {
        for(int index = r.begin(); index != r.end(); ++index) {
            int i = index / width;
            int j = index % width;
            auto color = glm::vec4(0.0f);
            for(int sps = 0; sps < NUM_SAMPLE_RAYS; ++sps) {
                float u = ((float)j + MagicRandom::Float(0, 1)) / (float)width;
                float v = ((float)i + MagicRandom::Float(0, 1)) / (float)height;
                Ray ray = camera.GetRay(u, v);
                color += glm::vec4(Tracing(ray, 0), 1.0f);
            }
            color /= (float)NUM_SAMPLE_RAYS;
            color.w = 1.0f;
            if (color.r != color.r)  color.r = 0.0f;
            if (color.g != color.g)  color.g = 0.0f;
            if (color.b != color.b)  color.b = 0.0f;
            color = glm::vec4(sqrt(color.x), sqrt(color.y), sqrt(color.z), color.w);  //gamma校正
            DrawPixel(i, j, color);  //将像素颜色写入图片
        }
    });

    auto save_dir = fs::current_path().parent_path() / "ray_tracing.png";
    stbi_flip_vertically_on_write(true);
    stbi_write_png(save_dir.c_str(), width, height, channel, image, width * channel);  //保存图像
} 
```

---

## *Reference*

- [https://yangwc.com/2019/05/08/RayTracer-Basis](https://yangwc.com/2019/05/08/RayTracer-Basis)
- [https://yangwc.com/2019/05/23/RayTracer-Advance](https://yangwc.com/2019/05/23/RayTracer-Advance)
- [https://raytracing.github.io/books/RayTracingTheRestOfYourLife.html#overview](https://raytracing.github.io/books/RayTracingTheRestOfYourLife.html#overview)
- [https://raytracing.github.io/books/RayTracingInOneWeekend.html#rays,asimplecamera,andbackground](https://raytracing.github.io/books/RayTracingInOneWeekend.html#rays,asimplecamera,andbackground)
- [https://learnopengl-cn.github.io/07%20PBR/01%20Theory/](https://learnopengl-cn.github.io/07%20PBR/01%20Theory/)
