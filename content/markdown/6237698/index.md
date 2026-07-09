---
type: markdown
title: 3D Rotations
slug: 6237698
date: 2023-11-08
updatedAt: 2026-06-23 13:10:27
tags:
  - 计算机图形学
  - 基础数学
published: true
category: mathmatics
---

三维空间下的旋转变换不是很直观，为了更好地理解旋转，我们首先介绍一点 *topology(拓扑学)*，这是一个研究空间连通性的数学分支。

之后我们会介绍空间旋转的各种表示方法，例如 

- *matrix(矩阵)*
- *Euler angles(欧拉角)*
- *angle-axis(轴角)*
- *quaternions(四元数)*

这些表示方法本质上都是等价的，而且可以相互转换，但是在应用于具体操作时，使用某些表示方法可能会更加便捷。这里有一些处理旋转操作的例子

- *inversion(逆变换)*
- *composition(合成)*
- *interpolation(插值)*
- *sampling(采样)*

---

## *1. Topology Primer(拓扑学入门)*

### *1.1. 2D Rotations(二维旋转)*

拓扑连通性是空间本身的基本特征，可以在任意的可逆变换下保持不变。我们从二维旋转空间 $\operatorname{SO}(2)$ 入手，来讲解拓扑性质。

对于 $\operatorname{SO}(2)$ 来说，我们首先需要关注的是 *angle wrap around(角度环绕)* 的问题，即旋转 $360^{∘}$ 等价于 $0^{∘}$，而在实际应用中，我们通常需要的是最短的旋转路径，例如从 $30^{∘}$ 旋转到 $330^{∘}$ 时，相比于逆时针旋转 $300^{∘}$，我们更倾向于选择顺时针旋转 $60^{∘}$.

虽然 $\operatorname{SO}(2)$ 空间与 $[0, 2\pi)$ 内的旋转角存在一一映射的关系，但它们在空间连续性上并不是等价的，如图所示

<center><img src="/content-images/external/40be64aa588f2b05bbde8468536c5c54.png" width=500px></center>

我们可以看到，虽然 $\operatorname{SO}(2)$ 与区间 $[0, 2\pi)$ 是一一映射的，但由于在点 $2\pi$ 上的连续性的不同，导致了它们拓扑结构的不同，前者与圆同坯，而后者与线段同坯。

另一方面，图中圆上红色点到绿色点的最短路径，在区间上则表现为一条不连续的路径。这也表明了两者拓扑结构的不同。

> **Definition 1. Paths(路径).** 我们定义拓扑空间 $\mathcal{X}$ 中的 *path(路径)*
> $$P:[a,b] \rightarrow \mathcal{X}$$ 其中 $a,b$ 表示分别路径的起点与终点，$P$ 表示将区间 $[a,b]$ 映射到拓扑空间 $\mathcal{X}$ 下的一个映射关系。

这样的定义比较抽象，我们还是以上图为例，设红色点和绿色点分别表示 $45^{∘}$ 和 $-30^{∘}$ 的旋转角，那么它们之间的最短路径实际上就是一种把区间 $[-30^{∘}, 45^{∘}]$ 映射到图中所示圆弧的映射关系。
   
如果两个拓扑空间存在一个保持路径连续性的双射，则它们在拓扑上是等价的，我们把这样的等价关系称为 *homeomorphism(同胚)*。如果不存在这样的双射，则称这两个空间不同坯。

现在我们可以说明 $\operatorname{SO}(2)$ 和单位圆是同坯的。从旋转角 $\theta$ 到圆上一点 $(\cos\theta, \sin\theta)$ 的映射是一个双射，其逆映射将圆上一点 $(x,y)$ 映射为旋转角 $\arctan(y / x)$，且它们在区间 $[0, 2\pi]$ 上都是连续的。

从以上讨论可以看出，二维空间上的旋转在本质上等价于圆周上的运动。当在两个旋转角之间进行插值时，通常需要的是它们的最短路径，因此旋转插值要么需要指定旋转的方向，要么需要计算路径最短的旋转方向。

### *1.2. Geodesic Distance and Interpolation(测地距离与插值)*

我们通常把拓扑空间下两点间的最短路径称为 *geodesic(测地线)*，其长度称为 *geodesic distance(测地距离)*，例如笛卡尔空间中，测地线就是直线，测地距离就是两点间的直线距离。

在复杂的拓扑空间下，测地距离往往很难计算，但是在 $\operatorname{SO}(2)$ 和 $\operatorname{SO}(3)$ 空间下，测地距离存在封闭形式。

我们定义两旋转角 $\theta_{1},\theta_{2}\in[0, 2\pi)$ 间的有向距离为

$$d(\theta_1,\theta_2) = \left\{ \begin{array}{ll}
\theta_2-\theta_1 & \text { if }-\pi<\theta_2-\theta_1 \leq \pi \\
\theta_2-\theta_1-2 \pi & \text { if } \theta_2-\theta_1>\pi \\
\theta_2-\theta_1+2 \pi & \text { if } \theta_2-\theta_1 \leq-\pi
\end{array}\right.$$

可以看到 $d(\theta_1,\theta_2) \in (-\pi, \pi]$，其中正向表示逆时针旋转，负向表示顺时针。测地线可以表示为有向距离的插值

$$\theta(s)=\left(\theta_1+s \cdot d\left(\theta_1, \theta_2\right)\right) \quad \bmod (2 \pi)$$

而测地距离即为有向距离的绝对值 $|d(\theta_1, \theta_2)|$.

### *1.3. The Elements of Topological Spaces(拓扑空间下的元素)*

我们介绍一些常见的拓扑空间：

- $\mathbb{R}^n$: $n$ 维笛卡尔空间。
- $S_{n}$: $n$ 维球面，其中 $S_{1}$ 表示圆，$S_{2}$ 表示三维球。
- $\operatorname{SO}(n)$: $n$ 维 *special orthogonal group(特殊正交群)*，即 
$$\operatorname{SO}(n) = \{Q\in \mathbb{R}^{n\times n} \mid QQ^{T}=I, |Q| = 1\}$$ 其中 $\operatorname{SO}(3)$ 表示所有三维空间下的旋转。
- $\operatorname{SE}(n)$: $n$ 为 *special Euclidean group(特殊欧式群)*，表示 $n$ 维空间下所有的刚性变换，例如
$$S E(3)=\left\{\mathbf{T}=\left[\begin{array}{ll}
\mathbf{R} & \mathbf{t} \\
\mathbf{0}^T & 1
\end{array}\right] \in \mathbb{R}^{4 \times 4} \mid \mathbf{R} \in S O(3), \mathbf{t} \in \mathbb{R}^3\right\}$$

让我们首先考虑一个更简单的例子，它将说明我们在表示3D 旋转时将遇到的一些问题。如果我们用经纬度表示半径为 $R$ 的球面

$$\mathbf{x}(\theta, \phi)=\left[\begin{array}{c}
R\cos \theta \cos \phi \\
R\sin \theta \cos \phi \\
R\sin \phi
\end{array}\right]$$

每个点都能用一对 $(\theta, \phi)$ 表示，但是对于北极点 $(0,0,R)$ 和南极点 $(0,0,-R)$，却有无限多的表示方法，只需要令 $\phi=\pi/2$，而 $\theta$ 可以任意选取。

这种表示方法的另一个缺点是两点间的插值并不容易计算，简单的将 $\theta, \phi$ 分别进行插值，得到的并不是最短的测地距离。

设球面上两点 $A_{1}(\theta_{1},\phi_{1}), A_{2}(\theta_{2},\phi_{2})$，我们尝试计算其测地距离的表达式，如图所示

<center><img src="/content-images/external/1807b92d8714e91f16619256845df880.png" width=400px></center>

图中 $O$ 为球心，$O_{1},O_{2},R_{1},R_{2}$ 分别为 $A_{1},A_{2}$ 所在纬度圈的圆心和半径，$B$ 为 $A_{2}$ 在 $A_{1}$ 纬度圈上的投影点，设 

$$\theta = \angle A_1 O A_2, \quad \phi = \angle A_{1}O_{1}B =  |\phi_{2} - \phi_{1}|$$

在 $\triangle A_1 O A_2$ 和 $\triangle A_1 O_1 B$ 中，根据余弦定理有

$$\|A_1 A_2\|^2=\|A_1 O\|^2+\|A_2 O\|^2-2 \|A_1 O\|  \|A_2 O\| \cos \theta=2 R^2(1-\cos \theta)$$

$$\|A_1 B\|^2=\|O_1 B\|^2+\|A_1 O_1\|^2-2 \|O_1 B\| \| A_1 O_1\| \cos \phi=R_1^2+R_2^2-2 R_1 R_2 \cos \phi$$

在直角三角形 $A_{1}BA_{2}$ 中，根据毕达哥拉斯定理有

$$\|A_1 A_2\|^2=R_1^2+R_2^2-2 R_1 R_2 \cos \phi+R^2\left(\sin \theta_1-\sin \theta_2\right)^2$$

联立并将 $R_{1} = R \cos(\theta_{1}), R_{2} = R\cos(\theta_{2})$ 代入得到著名的 *Haversine* 公式

$$\cos\theta = \cos \theta_1 \cos \theta_2 \cos \phi+\sin \theta_1 \sin \theta_2$$

> **Theorem 2. Haversine.** 对于任意角 $\theta$，定义 *haversine function(半正矢函数)* 为
> $$\operatorname{hav}(\theta)=\sin ^2\left(\frac{\theta}{2}\right)=\frac{1-\cos (\theta)}{2}$$ 则对于球面上两个用经纬度表示的点 $(\theta_{1},\phi_{1}), (\theta_{2},\phi_{2})$，其夹角 $\theta$ 满足
> $$\operatorname{hav}(\theta)=\operatorname{hav}\left(\theta_2-\theta_1\right)+\cos \left(\theta_1\right) \cos \left(\theta_2\right) \operatorname{hav}\left(\phi_2-\phi_1\right)$$

因此，$A_{1}A_{2}$ 的测地距离就是弧长

$$\widehat{A_1 A_2} = R \theta = R\arccos(\cos \theta_1 \cos \theta_2 \cos \phi+\sin \theta_1 \sin \theta_2)$$

可以看到，测地距离与参数 $\theta, \phi$ 并不是线性关系，因此不能直接对它们进行插值。

如果你曾经在赤道以北的两个目的地之间进行过洲际飞行，你就会观察到这种现象。

例如，从纽约到伦敦的飞行路线，在传统地图上看，实际上是一条弧形曲线，高于从纽约到伦敦的直线路径，毕竟飞机不可能从地底穿过。

航空公司对燃料的使用非常敏感，所以他们更喜欢沿着最短路径环绕地球飞行。这个问题的数学解决方案是沿着球面上的测地线进行插值。

值得一提的是，当测地距离非常近时，上式中的 $\cos\phi$ 项会得到一个 $0.9999 \ldots$ 的数字，会引入可观的浮点误差，我们可以用 *Haversine* 公式进行变换来消掉这一项，得到下面的式子进行计算

$$\widehat{A_1 A_2} = \begin{equation}
2 R \arcsin \left(\sqrt{\sin ^2\left(\frac{\theta_{2}-\theta_1}{2}\right)+\cos \theta_1 \cos \theta_2 \sin ^2\left(\frac{\phi_2-\phi_1}{2}\right)}\right)
\end{equation}$$

在 *python* 中可以调用 `geopy` 包进行计算。


---

## *2. Rotation Matrix(旋转矩阵)*

我们熟知矩阵可以表示空间变换，而对于三维空间下的旋转，有

> **Definition 3. Rotation Matrix.** 定义三维旋转矩阵为满足以下条件的实矩阵 $$R=\left[\begin{array}{lll}
r_{11} & r_{12} & r_{13} \\
r_{21} & r_{22} & r_{23} \\
r_{31} & r_{32} & r_{33}
\end{array}\right]$$ 
> 
> - *Orthogonality*: $R^{T}R=I$
> - *Positive Orientation*: $\operatorname{det}(R)=1$ 

其中第一个条件带来了 $6$ 个方程的约束，且限定了 $\operatorname{det}(R)=\pm 1$，因此第二个条件将满足六个方程的解数量减少了一半，所以 $R$ 本质上有三个自由度。

我们从单轴的旋转入手，这样的旋转是最为简单的，只需要固定一个轴不动，去转另外两个轴。如图所示

<center><img src="/content-images/external/0de61def4e0632c46bf4de5078627b80.png" width=600px></center>

红绿蓝分别表示 $x,y,z$ 轴，首先沿 $z$ 轴旋转 $\theta_{z}$ 的旋转矩阵为

$$R_Z(\theta)=\left[\begin{array}{ccc}
\cos \theta & -\sin \theta & 0 \\
\sin \theta & \cos \theta & 0 \\
0 & 0 & 1
\end{array}\right]$$

我们稍作解释，想象一下绕 $z$ 的旋转过程，可以发现仅有 $x,y$ 坐标在不断变化，而 $z$ 坐标保持不变，因此这实际上是一个与 $z$ 无关的二维旋转。

我们把 $z$ 轴看做纸面向外的方向，$x$ 轴在纸面中指向右侧，$y$ 轴在纸面中指向上方，那么我们就转化为了熟知的二维旋转矩阵，至于不变的 $z$ 轴，补 $(0,0,1)$ 就行了。

同理，我们可以写出沿 $x$ 轴的旋转矩阵

$$R_X(\theta)=\left[\begin{array}{ccc}
1 & 0 & 0 \\
0 & \cos \theta & -\sin \theta \\
0 & \sin \theta & \cos \theta
\end{array}\right]$$


至于 $y$ 轴的矩阵则略有不同，这是因为把 $y$ 轴看做直面朝外的方向，则需要把 $z$ 轴看做指向右侧的轴，$x$ 轴看做指向上方的轴，因此

$$R_Y(\theta)=\left[\begin{array}{ccc}
\cos \theta & 0 & \sin \theta \\
0 & 1 & 0 \\
-\sin \theta & 0 & \cos \theta
\end{array}\right]$$

有了旋转矩阵 $R$ 我们可以进行如下的操作

- 应用于点: 对于空间下的点 $p$，将旋转操作应用于它得到旋转后的点 $p^{\prime} = R p$
- 复合旋转: 对于两个旋转 $R_{1},R_{2}$，它们的复合旋转为 $R = R_{2}R_{1}$
- 逆运算: 对于旋转后的点 $p^{\prime}$，可以逆运算得到初始点 $p = R^{-1}p^{\prime}$

接下来我们要讨论一个经典的问题，它提醒我们，应用复合旋转时，实际进行的是 *extrinsic rotation(外部旋转)*，如图所示

<center><img src="/content-images/external/4edfbf56e05cc3891255ef30f88f2e96.png" width=600px></center>

$R_{1},R_{2}$ 分别是绕 $z,x$ 轴的旋转，当进行复合旋转 $R_{2}R_{1}$ 时，首先绕 $x$ 轴进行 $R_{1}$ 旋转，然后绕世界系下的 $z$ 轴（图中黑色轴）进行 $R_{2}$ 旋转，而不是第一次旋转后得到的 $z$ 轴（图中蓝色虚线轴）

与之相反的是 *intrinsic rotations(内部旋转)*，设点 $p(1, 2, 3)$ 为刚体 $B$ 上的一点，$B$ 拥有自己的局部坐标系且初始时与世界系重合，首先将 $B$ 绕自身的 $z$ 轴旋转 $90^{\circ}$，接下来绕自身的 $x$ 轴旋转 $90^{\circ}$，最后进行平移操作 $t(10,0,5)$，求此时 $p$ 的坐标。

首先我们看一个 *naive* 的解

1. 应用旋转 $R_Z\left(90^{\circ}\right)$ 于点 $(1,2,3)$ 得到 $(-2, 1, 3)$
2. 应用旋转 $R_X\left(90^{\circ}\right)$ 于点 $(-2,1,3)$ 得到 $(-2, -3, 1)$
3. 应用平移操作得到 $(8, -3, 6)$

这显然是错误的，因为它使用的是外部旋转，应用的是世界坐标系去计算

$$p^{\prime} = R_X\left(90^{\circ}\right) R_Z\left(90^{\circ}\right) p+t$$

然而题目要求的是绕局部坐标系的内部旋转，因此正确的解为

1. 应用旋转 $R_Z\left(90^{\circ}\right)$ 于点 $(1,2,3)$ 得到 $(-2, 1, 3)$
2. 应用旋转 $R_Z\left(90^{\circ}\right)$ 于刚体 $B$ 的 $x$ 轴得到新的局部 $x$ 轴 $(0,1,0)$，即世界系的 $y$ 轴
2. 应用旋转 $R_Y\left(90^{\circ}\right)$ 于点 $(-2,1,3)$ 得到 $(3, 1, 2)$
3. 应用平移操作得到 $(13, 1, 7)$

这里我们是把内部旋转转化为了外部旋转来做

$$p^{\prime} = R_Z\left(90^{\circ}\right) R_X\left(90^{\circ}\right) p+t$$

---

## *3. Euler Angles(欧拉角)*

欧拉角是最为常用的旋转表示，例如大家最为熟悉的 *Unity* 提供给用户调整的就是欧拉角。

欧拉角用三个参数 $(\phi, \theta, \psi)$ 表示旋转，这三个角度分别与 $R_{X},R_{Y},R_{Z}$ 相关，例如航空器常用 *roll-pitch-yaw* 来分别表示 $x,y,z$ 轴的旋转角度，它们的复合旋转

$$R_{r p y}(\phi, \theta, \psi)=R_Z(\phi) R_Y(\theta) R_X(\psi)$$

这里使用的是 $x,y,z$ 的顺序，当然我们也可以选择别的顺序，例如

$$R_{A B C}(\phi, \theta, \psi)=R_A(\phi) R_B(\theta) R_C(\psi)$$

根据旋转矩阵的逆

$$R^{-1}_{r p y}(\phi, \theta, \psi)=R_X^{-1}(\psi)R_Y^{-1}(\theta) R_Z^{-1}(\phi)  $$

可以很容易的写出欧拉角的逆  $(-\psi,-\theta,-\phi)$.

我们发现对于给定的欧拉角 $R(\phi, \theta, \psi)$，很容易得到对应的旋转矩阵，而将旋转矩阵分解为欧拉角的过程并没有这么显而易见。

对于给定的旋转矩阵 $R_{rpy}$，根据矩阵乘法有

$$\begin{equation}R_{rpy} =
\begin{bmatrix} r_{11} & r_{12} & r_{13} \\ r_{21} & r_{22} & r_{23} \\ r_{31} & r_{32} & r_{33} \end{bmatrix} = \left[\begin{array}{ccc}
\cos \theta \cos \phi & \sin \psi \sin \theta \cos \phi-\cos \psi \sin \phi & \cos \psi \sin \theta \cos \phi+\sin \psi \sin \phi \\
\cos \theta \sin \phi & \sin \psi \sin \theta \sin \phi+\cos \psi \cos \phi & \cos \psi \sin \theta \sin \phi-\sin \psi \cos \phi \\
-\sin \theta & \sin \psi \cos \theta & \cos \psi \cos \theta
\end{array}\right]\end{equation} $$

首先根据左下角元素 $r_{31}$ 可以求出 $\theta$ 的两个解

$$\theta_{1} = -\arcsin r_{31},\quad \theta_{2}= -\arcsin r_{31} + \pi$$

这里我们先忽略 $R_{31}= \pm 1$ 的情况，之后再去讨论它。接下来根据 $r_{32},r_{33}$ 可以确定

$$\psi = \operatorname{atan2}(\frac{r_{32}}{\cos\theta}, \frac{r_{33}}{\cos\theta})$$

这里的 `atan2()` 是一个根据正余弦值求角度的函数，其原理是根据

<center><img src="/content-images/external/1a7185bbbc1c0ca0c700b1e6ed058960.png" width=500px></center>

确定角度所处的象限，然后用 $\arctan$ 来求出具体的角度。这里当 $\cos\theta=0$ 时会有问题，我们稍后讨论。

这样的话我们就求出了两个 $\theta$ 所对应的两个 $\psi$ 值

$$\begin{aligned}
& \psi_1=\operatorname{atan2}\left(\frac{r_{32}}{\cos \theta_1}, \frac{r_{33}}{\cos \theta_1}\right) \\
& \psi_2=\operatorname{atan2}\left(\frac{r_{32}}{\cos \theta_2}, \frac{r_{33}}{\cos \theta_2}\right)
\end{aligned}$$

同样的，根据 $r_{11},r_{21}$ 可以求出对应的两个 $\phi$ 值

$$\begin{aligned}
\phi_1 & =\operatorname{atan2} \left(\frac{r_{21}}{\cos \theta_1}, \frac{r_{11}}{\cos \theta_1}\right) \\
\phi_2 & =\operatorname{atan2} \left(\frac{r_{21}}{\cos \theta_2}, \frac{r_{11}}{\cos \theta_2}\right)
\end{aligned}$$

现在我们求出了可能的两组解 $\left(\psi_1, \theta_1, \phi_1\right), \left(\psi_2, \theta_2, \phi_2\right)$，通过矩阵中没有用到的 $r_{12},r_{13},r_{22},r_{23}$ 可以验证哪个是合法的解。

最后我们讨论 $R_{31}=\pm 1$ 的情况，此时 $\theta = \pm \frac{\pi}{2}$，这会导致 $\cos\theta = 0$，此时我们发现 $r_{11},r_{21},r_{32},r_{33}=0$，失去了约束效力，需要特殊处理。

当 $\theta=\frac{\pi}{2}$ 时，有

$$\begin{aligned}
& r_{12}=\sin \psi \cos \phi-\cos \psi \sin \phi=\sin (\psi-\phi) \\
& r_{13}=\cos \psi \cos \phi+\sin \psi \sin \phi=\cos (\psi-\phi) \\
& r_{22}=\sin \psi \sin \phi+\cos \psi \cos \phi=\cos (\psi-\phi)=r_{13} \\
& r_{23}=\cos \psi \sin \phi-\sin \psi \cos \phi=-\sin (\psi-\phi)=-r_{12}
\end{aligned}$$

因此得到

$$\psi=\phi+\operatorname{atan2} \left(r_{12}, r_{13}\right)$$

当 $\theta=-\frac{\pi}{2}$ 时，有

$$\begin{aligned}
& r_{12}=-\sin \psi \cos \phi-\cos \psi \sin \phi=-\sin (\psi+\phi) \\
& r_{13}=-\cos \psi \cos \phi+\sin \psi \sin \phi=-\cos (\psi+\phi) \\
& r_{22}=-\sin \psi \sin \phi+\cos \psi \cos \phi=\cos (\psi+\phi)=-r_{13} \\
& r_{23}=-\cos \psi \sin \phi-\sin \psi \cos \phi=-\sin (\psi+\phi)=r_{12}
\end{aligned}$$

因此得到

$$\psi=-\phi+\operatorname{atan2} \left(-r_{12}, -r_{13}\right)$$

我们发现当 $\theta = \pm \frac{\pi}{2}$ 时，另外两个轴上的旋转量 $\phi,\psi$ 有无穷多的解，这就是著名的 *gimbal lock(万向锁)* 现象。

我们来解释一下这个现象，当我们先绕 $x$ 轴旋转 $\psi$ 后，此时 $x$ 轴不动，接下来绕世界系的 $y$ 轴旋转 $90^{\circ}$，此时 $x$ 轴与世界系的 $z$ 轴重合，那么我们最后绕世界系的 $z$ 轴旋转 $\phi$，这与第一步中绕物体的 $x$ 轴旋转是等价的，也就是说我们实际进行的操作是

$$R_{r p y}(\phi, \theta, \psi)= R_Z(\phi) R_Y(\frac{\pi}{2}) R_X(\psi) = R_Y(\frac{\pi}{2}) R_X(\psi + \phi)$$

这也就解释了只要 $\psi + \phi$ 是一个定值，都可以表示同一个旋转矩阵 $R$.

> **Theorem 4. Conversion(转化关系).** 对于给定的旋转矩阵 $$R_{r p y}=\left[\begin{array}{lll}
r_{11} & r_{12} & r_{13} \\
r_{21} & r_{22} & r_{23} \\
r_{31} & r_{32} & r_{33}
\end{array}\right]$$ 对应欧拉角 $(\phi, \theta, \psi)$ 的求解方法如下:
> 
> - 若 $r_{31} \neq \pm 1$，则 $$\begin{aligned}
& \theta_1=-\arcsin r_{31} \\
& \theta_2=\pi-\theta_{1} \\
& \phi_1=\operatorname{atan2} \left(\frac{r_{21}}{\cos \theta_1}, \frac{r_{11}}{\cos \theta_1}\right) \\
& \phi_2=\operatorname{atan2} \left(\frac{r_{21}}{\cos \theta_2}, \frac{r_{11}}{\cos \theta_2}\right) \\
& \psi_1=\operatorname{atan2} \left(\frac{r_{32}}{\cos \theta_1}, \frac{r_{33}}{\cos \theta_1}\right) \\
& \psi_2=\operatorname{atan2} \left(\frac{r_{32}}{\cos \theta_2}, \frac{r_{33}}{\cos \theta_2}\right)
\end{aligned}$$ 最后根据下面的式子验证两个解的合法性 $$\begin{aligned}
& r_{12}=\sin \psi \cos \phi-\cos \psi \sin \phi \\
& r_{13}=\cos \psi \cos \phi+\sin \psi \sin \phi \\
& r_{22}=\sin \psi \sin \phi+\cos \psi \cos \phi \\
& r_{23}=\cos \psi \sin \phi-\sin \psi \cos \phi
\end{aligned}$$
> - 若 $r_{31} = -1$，则 $$\begin{aligned}
& \theta=\pi / 2 \\
& \phi=\text {anything } \\
& \psi=\phi+\operatorname{atan2} \left(r_{12}, r_{13}\right)
\end{aligned}$$
> - 若 $r_{31} = 1$，则 $$\begin{aligned}
& \theta=-\pi / 2 \\
& \phi=\text {anything } \\
& \psi=-\phi+\operatorname{atan2} \left(-r_{12}, -r_{13}\right)
\end{aligned}$$

---

## *4. Axis-angle(轴角)*

轴角也是表示旋转的一种常用方式，它使用一个旋转轴向量 $a$ 以及旋转角 $\theta$ 来表示一个旋转，其中 $\|a\|=1$，由于模长的限制，自由度依旧是 $3$.

轴角的逆非常容易表示，即 $(a,-\theta)$ 或 $(-a, \theta)$，接下来我们讨论如何使用轴角将旋转操作应用于空间上的点。

### *4.1 Rodrigues' Rotation Formula(罗德里格斯旋转公式)*

> **Theorem 5. Rodrigues' Rotation Formula.** 对于空间内一点 $p$，以及给定的轴角旋转 $(a,\theta)$，旋转后的点为
> $$p^{\prime}=p \cos \theta +\sin \theta(a \times p)+(1-\cos \theta)(a \cdot p)a$$ 这个式子被称为 *Rodrigues' rotation formula(罗德里格斯旋转公式)*.

首先，我们可以将空间内的任意一点 $p$ 分解为平行和垂直于旋转轴 $a$ 的两个向量

$$\begin{gathered}
p_{\|}=(a \cdot p) a \\
p_{\perp}=p-(a \cdot p) a
\end{gathered}$$

旋转操作不影响平行于轴的部分 $p_{\|}$，但是改变了 $p_{\perp}$ 的方向，即旋转后的 $p_{\perp}$ 为 $p^{\prime}_{\perp}$.

为了求出 $p^{\prime}_{\perp}$，我们在以 $a$ 为法向量的投影平面上建立二维坐标系，坐标轴分别为

$$u = p_{\perp}, \quad v = a\times p$$

那么在这个局部坐标系中，$p_{\perp}$ 的坐标就是 $(1, 0)$，旋转 $\theta$ 得到 $p^{\prime}_{\perp}$ 坐标为 $(\cos\theta, \sin\theta)$，映射回世界系就是

$$p^{\prime}_{\perp} = \sin \theta(a \times p)+\cos \theta p_{\perp}$$

再加上平行部分 $p_{\|}$ 得到

$$p^{\prime}=p \cos \theta +\sin \theta(a \times p)+(1-\cos \theta)(a \cdot p)a$$


### *4.2 Converting to Rotation Matrix(轴角转化为旋转矩阵)*

现在我们有了旋转后点的表达式，我们希望将它表达为旋转矩阵的形式，即 $p^{\prime} = Rp$，为此，我们引入 *cross-product matrix(叉乘矩阵)*

$$\hat{a} = \left[\begin{array}{ccc}
0 & -a_z & a_y \\
a_z & 0 & -a_x \\
-a_y & a_x & 0
\end{array}\right]$$

我们可以验证它的一个非常美妙的性质，即对于任意向量 $b$ 有

$$\hat{a} b = \left[\begin{array}{ccc}
0 & -a_z & a_y \\
a_z & 0 & -a_x \\
-a_y & a_x & 0
\end{array}\right]\left[\begin{array}{ccc}
b_{x}  \\
b_{y}  \\
b_{z} 
\end{array}\right] = a\times b$$

这样的话，我们就把叉乘转化为了矩阵乘法，另一方面，我们可以把

$$p_{\perp} = p−(a\cdot p)a = -a\times (a\times p) = - \hat{a}^{2}p$$

写成叉乘的形式，从而得到

$$(a\cdot p) a = p + \hat{a}^{2}p = (I + \hat{a}^{2})p$$

带入到旋转表达式中得到

$$\begin{aligned}p^{\prime} 
&= p \cos \theta +\hat{a} p\sin \theta+(1-\cos \theta)(I + \hat{a}^{2})p \\
&= \left\{I + \hat{a}\sin \theta + (1-\cos \theta)\hat{a}^{2}\right\} p 
\end{aligned}$$

因此我们的旋转矩阵就是

$$R(a,\theta) = I + \hat{a}\sin \theta + (1-\cos \theta)\hat{a}^{2}$$

### *4.3 Converting from Rotation Matrix(旋转矩阵转化为轴角)*

接下来做逆过程，对于给定的旋转矩阵 $R$，我们计算对应的轴角表示

$$R=\left[\begin{array}{lll}
r_{11} & r_{12} & r_{13} \\
r_{21} & r_{22} & r_{23} \\
r_{31} & r_{32} & r_{33}
\end{array}\right]=\left[I\cos \theta + \hat{a}\sin \theta+(1-\cos \theta) aa^T\right]$$

这里我们用到了如下的性质

$$\hat{a}^{2} = \left[\begin{array}{ccc}
-a_z^2-a_y^2 & a_x a_y & a_x a_z \\
a_x a_y & -a_x^2-v_z^2 & a_y a_z \\
a_x a_z & a_y a_z & -a_x^2-a_y^2
\end{array}\right] = aa^{T} - I$$

我们算一下它的迹

$$\operatorname{tr}(R)=3 \cos \theta+(1-\cos \theta) \operatorname{tr}\left(aa^T\right)=1+2 \cos \theta $$

这样我们就得到了

$$\theta=\cos ^{-1}\left(\frac{\operatorname{tr}(R)-1}{2}\right)$$

接下来我们用矩阵中的对称元素来计算旋转轴，以 $r_{12},r_{21}$ 为例，有

$$r_{12}-r_{21}=-a_z \sin \theta+(1-\cos \theta) a_x a_y-\left(a_z \sin \theta+(1-\cos \theta) a_x a_y\right)=-2 a_z \sin \theta$$

整理得到旋转轴

$$a=\frac{1}{2 \sin (\theta)}\left[\begin{array}{l}
r_{32}-r_{23} \\
r_{13}-r_{31} \\
r_{21}-r_{12}
\end{array}\right]$$

这里要求 $\sin\theta \neq 0$，因此需要处理两种特殊情况。

当 $\theta = 0$ 时，旋转后无事发生，因此 $a$ 可以是任意的。

当 $\theta = \pi$ 时，有 $R = 2aa^{T}-I$，由于 $$a a^T=\left[\begin{array}{ccc}
a_x^2 & a_x a_y & a_x a_z \\
a_x a_y & a_y^2 & a_y a_z \\
a_x a_z & a_y a_z & a_z^2
\end{array}\right]$$ 根据对角线元素可以解得 
$$\begin{aligned}
a_x&= \pm \sqrt{\left(r_{11}+1\right) / 2} \\
a_y&= \pm \sqrt{\left(r_{22}+1\right) / 2} \\
a_z&= \pm \sqrt{\left(r_{33}+1\right) / 2}
\end{aligned}$$ 根据其它元素可以确定正负号，由于旋转 $180^{\circ}$ 时，旋转轴的两种朝向是等价的，因此可以令 $\operatorname{sgn}(a_{x}) = 1$，则

- 若 $a_{x} \neq 0$，则 $\operatorname{sgn}(a_{y})=\operatorname{sgn}(r_{12}), \operatorname{sgn}(a_{z})=\operatorname{sgn}(r_{13})$.
- 若 $a_{x} = 0$，则 $\operatorname{sgn}(a_{y})=1, \operatorname{sgn}(a_{z})=\operatorname{sgn}(r_{23})$. 

总结一下，就是

$$a = \left[\sqrt{\frac{\left(r_{11}+1\right)}{2}}, c_{y}\sqrt{\frac{\left(r_{22}+1\right)}{2}}，  c_{z}\sqrt{\frac{\left(r_{33}+1\right)}{2}}\right]^{T}$$

其中

$$c_{y} = \begin{cases}
1   & \text{ if } r_{12}\geq 0\\
-1  & \text{ if } r_{12} < 0
\end{cases}, \quad c_{z} = \begin{cases}
\operatorname{sgn}(r_{23})  & \text{ if } r_{13} = 0\\
\operatorname{sgn}(r_{13})  & \text{ if } r_{13} \neq 0
\end{cases}$$

### *4.4 Geodesic Interpolation(测地插值)*

使用轴角表示旋转的核心优势在于，它非常容易进行插值，想象一个刚体从位姿 $R_{0}$ 旋转到 $R_{1}$，这里的旋转矩阵实际上是 $R^{-1}_{0}R_{1}$，因此我们只需要对它进行插值，最后再乘上初始位姿即可。

设 $R^{-1}_{0}R_{1} = R_{\Delta}(a, \theta)$，则插值可以表示为

$$R(t) = R_{0}R_{\Delta}(a, t\theta), \quad t\in [0, 1]$$

---

## *5. Conclusion*

本文介绍了旋转矩阵，欧拉角，轴角的旋转表示方法，它们各有优缺点。

- 旋转矩阵的优势在于，其与空间旋转是一一对应的关系，但是缺点也很明显，就是用 $9$ 个元素来表示，过于消耗内存与计算资源。
- 欧拉角的表示非常直观，易于理解，它适用于给用户呈现使用，但是有万向锁的问题。
- 轴角的定义非常简单直观，而且便于插值，但是其与空间旋转并非一一对应，且两个旋转无法直接合成。

有没有一种完美的表示方法可以兼顾以上所有的优点呢？四元数应运而生，我们将在下一篇文章中介绍它。

---


## *Reference*

- http://motion.pratt.duke.edu/RoboticSystems/3DRotations.html
- https://zhuanlan.zhihu.com/p/373411796
- https://en.wikipedia.org/wiki/Haversine_formula
- https://eecs.qmul.ac.uk/~gslabaugh/publications/euler.pdf
