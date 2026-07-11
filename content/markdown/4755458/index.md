---
type: markdown
title: Surface Simplification with QEM
slug: "4755458"
date: 2024-07-05
updatedAt: 2026-07-11 17:26:38
tags:
  - 计算机图形学
  - 算法
published: true
category: computer-science
---

*Mesh* 下采样是一个非常重要的算法，通过下采样我们可以大量降低 *Mesh* 的 *level of details(层次细节)*，我们列举一些应用场景

- **Optimize Mesh Algorithms**  例如计算 *Mesh* 碰撞深度时，直接使用原始 *Mesh* 进行计算需要 $O(N\log N)$ 的复杂度，如果将面片数量下采样至 $10\%$，那么碰撞算法的时间常数将缩小至原来的 $\frac{1}{10}$.
- **Multiresolution Rendering** 对于距离较远的投影尺寸较小的模型，可以渲染它的下采样版本替代原本细节丰富的 *Mesh*，提高渲染效率。
- **Simulation Proxy** 在做物理仿真时，可以在下采样的 *Mesh* 上进行仿真，然后通过插值方法得到原 *Mesh* 的近似仿真结果，提高仿真效率。

本文我们根据 *[Surface Simplification Using Quadric Error Metrics](https://www.cs.cmu.edu/~./garland/Papers/quadrics.pdf)* 介绍一种简单常用的 *Mesh* 下采样算法。

---

## *1. Introduction*

常见的下采样算法有三类

- **Vertex Decimation(顶点抽取)** 每次从 *Mesh* 上选取一个顶点删除，同时删除其相邻面片，将产生的孔洞重新三角化。该方法虽然高效，但是仅限于处理 *manifold surfaces(流形表面)*，且算法需要维护 *Mesh* 的拓扑结构。
- **Vertex Clustering(顶点聚类)** 将 *Mesh* 的包围盒划分为一个 *grid(网格)*，将落在同一个 *cell(小格子)* 中的顶点聚类为一个，然后更新面片。该方法几乎适用于所有的 *Mesh*，但输出结果的质量通常较低。
- **Edge Contraction(边收缩)** 每次从 *Mesh* 上选取一条边，将其收缩为一个顶点，并删除退化的面。更一般的，可以选取不在同一条边上的顶点对 $(v_{1},v_{2})$ 进行收缩。

我们的方法是基于边收缩的，如图所示

<center><img src="/content-images/external/9ca3360d11be78336ffb21406050cb1e.png" witdh=400></center>

首先找到所有可选的点对 $(v_{1},v_{2})$，可选的点对需要满足以下条件之一

- $(v_{1},v_{2})$ 是一条边
- $\left\|v_1-v_2\right\|<t$，其中 $t$ 为阈值参数

即用欧式距离选取较近的点对或有边直接相邻的点对进行收缩，当 $t=0$ 时，就是纯粹的边收缩。

``` python
def select_pairs(mesh: Trimesh, threshold):
    points = np.array(mesh.vertices)
    inner = np.matmul(points, points.T)
    xx = np.sum(points ** 2, axis=-1, keepdims=True)
    dist = xx - 2 * inner + xx.T
    pairs = [(vi, vj) for vi, vj in zip(*np.where(dist < threshold ** 2)) if vi < vj]
    edges = [(vi, vj) for vi, vj in zip(mesh.edges[:, 0], mesh.edges[:, 1])]
    pairs = pairs + edges + [(vj, vi) for vi, vj in edges]
    pairs = [(vi, vj) for vi, vj in pairs if vi < vj]
    pairs = sorted(list(set(pairs)))
    return pairs
```

---

## *2. Approximating Quadric Errors(二次误差度量)*

现在我们选取了很多点对，每次迭代时从中选择一个进行收缩，我们希望进行本次收缩后得到的 *Mesh* 与原 *Mesh* 的差别最小。

考虑一次收缩 $(v_{1},v_{2})$，设收缩后的顶点为 $\bar{v}$，定义 $\text{plane}(v_{i})$ 表示顶点 $v_{i}$ 所在的面片集合，我们的优化目标为

$$\bar{v}=\underset{v}{\arg \min } \sum_{p \in \text {plane}\left(v_1\right) \cup \text {plane}\left(v_2\right)} \operatorname{distance}(v, p)^2$$

这里稍作解释，当我们执行收缩时，只有包含 $v_{1},v_{2}$ 的面片会受到影响，因此我们最小化 $\bar{v}$ 到这些受到影响的面片的距离和得到最优的 $\bar{v}$.

设平面 $p$ 的方程为 $ax + by + cz + d = 0$，其中 $a^{2}+b^{2}+c^{2}=1$，记 $v = [x, y, z, 1]^T, p = [a, b, c, d]^T$，那么

$$\text {distance}(v, p)^2=\left(v^T p\right)^2=v^T p p^T v=v^T K_p v$$

其中 $K_p=p p^T$，因此

$$\begin{aligned} \bar{v}
&=\underset{v}{\arg \min } v^T\left(\sum_{p \in \text {plane}\left(v_1\right) \cup \text {plane}\left(v_2\right)} K_p\right) v \\
&\approx \underset{v}{\arg \min } v^T\left(\sum_{p \in \operatorname{plane}\left(v_1\right)} K_p+\sum_{p \in \operatorname{plane}\left(v_2\right)} K_p\right) v \\
&= \underset{v}{\arg \min } v^T\left(Q_1+Q_2\right) v
\end{aligned}$$

其中 $Q_i=\sum_{p \in \text {plane}\left(v_i\right)} K_p$ 是一个仅与 *Mesh* 属性有关的矩阵，可以预处理出来

``` python
def get_plane_equation(p1, p2, p3):
    normal = np.cross(p2 - p1, p3 - p1)
    normal = normal / np.linalg.norm(normal)
    d = -np.dot(p1, normal)
    return np.array([*normal, d])


def get_q_matrix(mesh: Trimesh, planes, vid):
    q = np.zeros((4, 4))
    for k in np.where(mesh.faces == vid)[0]:
        p = planes[k].reshape(1, -1)
        q += p.T @ p
    return q
    
planes = np.array([get_plane_equation(*mesh.vertices[face]) for face in mesh.faces])
q_matrices = np.array([get_q_matrix(mesh, planes, vid) for vid in range(len(mesh.vertices))])
```

接下来我们就需要解这个优化问题得到最优顶点 $\bar{v}$，令 $Q = Q_{1} + Q_{2}$，我们枚举的其次坐标 $v = [x,y,z,1]^{T}$ 包含三个变量，令

$$\frac{\partial \bar{v}}{\partial x} = \frac{\partial \bar{v}}{\partial y} = \frac{\partial \bar{v}}{\partial z} = 0$$

得到方程

$$\left[\begin{array}{cccc}
Q_{11} & Q_{12} & Q_{13} & Q_{14} \\
Q_{12} & Q_{22} & Q_{23} & Q_{24} \\
Q_{13} & Q_{23} & Q_{33} & Q_{34} \\
0 & 0 & 0 & 1
\end{array}\right] \bar{v}=\left[\begin{array}{l}
0 \\
0 \\
0 \\
1
\end{array}\right]$$

记左侧的矩阵为 $A$，若 $A$ 可逆，则

$$\bar{v} = A^{-1} [0,0,0,1]^{T}$$

否则我们就在 $v_{1},v_{2},\frac{v_{1}+v_{2}}{2}$ 中选择一个距离最小的顶点即可。

``` python
def optimize_pair(mesh: Trimesh, q_matrices, pair):
    Q1, Q2 = q_matrices[list(pair)]
    Q = Q1 + Q2
    A = np.concatenate([Q[:3, :], [[0, 0, 0, 1]]], axis=0)
    if np.linalg.det(A) > 0:
        v_opt = np.linalg.inv(A) @ np.array([[0], [0], [0], [1]])
        cost = v_opt.T @ Q @ v_opt
        v_opt = v_opt[:3, 0]
    else:
        v1, v2 = mesh.vertices[list(pair)]
        vm = (v1 + v2) / 2
        v_opt = min([v1, v2, vm], key=lambda v: v.T @ Q @ v)
        cost = v_opt.T @ Q @ v_opt
        v_opt = v_opt[:3, 0]
    return float(cost), v_opt
```

---

## *3. Iterative Update(迭代更新)*

我们已经讨论了一次收缩的过程，还记得我们选取了很多点对，每次迭代时选取一个距离最小的点对进行收缩，然后更新 *Mesh* 与相应的 $Q$ 矩阵，继续选取下一个点对。

> **Method 1. QEM Algorithm.** 对于输入的 *Mesh*，采样率 $r$ 以及收缩阈值 $t$，使用 *QEM* 进行下采样的算法流程如下
>
> 1. 根据 *Mesh* 计算初始的 $Q$ 矩阵
> 2. 根据 *Mesh* 和收缩阈值 $t$ 计算所有可收缩点对 $$\text{pairs} = \text{select_pairs}(\text{Mesh}, t)$$
> 3. 计算 $\text{pairs}$ 中每个点对的收缩代价，并以此为键值建立小根堆 $\text{heap}$
> 4. 重复执行以下过程直至达到采样率 $r$
>   - 从 $\text{heap}$ 中取出堆顶点对 $(v_{1}, v_{2})$ 执行一次收缩
>   - 更新 $Q$ 矩阵与 $\text{heap}$

``` cpp
def simplify(mesh: Trimesh, ratio=0.5, threshold=0):
    planes = np.array([get_plane_equation(*mesh.vertices[face]) for face in mesh.faces])
    q_matrices = np.array([get_q_matrix(mesh, planes, vid) for vid in range(len(mesh.vertices))])

    pairs = select_pairs(mesh, threshold)
    heap = sorted([(*optimize_pair(mesh, q_matrices, pair), pair) for pair in pairs], key=lambda x: x[0])

    v_status, f_status = np.ones(len(mesh.vertices)), np.ones(len(mesh.faces))
    target_nums = ratio * len(mesh.faces)
    while np.sum(f_status) > target_nums:
        _, v_opt, (v1, v2) = heap[0]
        # 更新顶点
        mesh.vertices[v1] = v_opt
        mesh.vertices[v2] = v_opt
        # 移除顶点v2
        v_status[v2] = 0
        # 移除v1,v2共有的面片
        v1_faces = np.where(mesh.faces == v1)[0]
        v2_faces = np.where(mesh.faces == v2)[0]
        common_faces = [f for f in v1_faces if f in v2_faces]  # 同时包含v1,v2的面片
        f_status[common_faces] = 0  # 删除共有面片
        # 更新面片
        mesh.faces[np.where(mesh.faces == v2)] = v1
        # 更新面片方程
        for idx in set(v1_faces) | set(v2_faces):
            planes[idx] = get_plane_equation(*mesh.vertices[mesh.faces[idx]]) if f_status[idx] else np.array([0, 0, 0, 0])
        # 更新顶点v1对应的Q矩阵
        q_matrices[[v1, v2]] = get_q_matrix(mesh, planes, v1)
        # 更新heap
        heap_new = []
        for item in heap:
            if v1 in item[2] or v2 in item[2]:
                u = item[2][0] if item[2][0] != v2 else v1
                v = item[2][1] if item[2][1] != v2 else v1
                pair = (min(u, v), max(u, v))
                if pair[0] != pair[1] and pair not in [rec[2] for rec in heap_new]:
                    cost, v_opt = optimize_pair(mesh, q_matrices, pair)
                    heap_new.append((cost, v_opt, pair))
            else:
                heap_new.append(item)

        heap = sorted(heap_new, key=lambda x: x[0])

    # 执行真删除
    v_serial = np.delete(np.arange(len(mesh.vertices)), np.where(v_status == 0)[0]).tolist()
    vertices = np.delete(mesh.vertices, np.where(v_status == 0)[0], axis=0)
    faces = np.delete(mesh.faces, np.where(f_status == 0)[0], axis=0)
    faces = np.array([[v_serial.index(p1), v_serial.index(p2), v_serial.index(p3)] for (p1, p2, p3) in faces])

    return trimesh.Trimesh(vertices=vertices, faces=faces)
```
