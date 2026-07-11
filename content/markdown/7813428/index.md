---
type: markdown
title: 3D Rotation Representations in Deep Learning
slug: "7813428"
order: 20
date: 2023-12-12
updatedAt: 2026-07-10 21:05:54
tags:
  - 深度学习
published: true
category: machine-learning
---

本文是对 [*On the Continuity of Rotation Representations in Neural Networks*](https://arxiv.org/pdf/1812.07035.pdf) 的解读，这篇文章指出了在深度学习中，不连续的旋转不是好的特征表示，因为这种表示会造成监督信号的不连续，不利于神经网络的训练与推理。

文章首先介绍了连续表示的定义，然后说明了欧拉角、轴角、四元数都不是连续的旋转表示，最后提出了一种适合深度学习的 *6D* 旋转表示方法，最后使用球极投影得到 *5D* 的旋转表示。

---

## *1. Definition of Continuous Representation(连续表示的定义)*

我们在 [3D Rotations](http://blog.leanote.com/post/chty_syq/3D-Rotations) 中曾以 *2D* 旋转为例，通过说明二维旋转空间 $SO(2)$ 与区间 $[0,2\pi)$ 连续性的不同，解释了拓扑空间的一些基本性质。

我们继续沿用这个例子，由于 $SO(2)$ 空间可以表示为全体二维旋转矩阵

$$M=\left[\begin{array}{cc}
\cos (\theta) & -\sin (\theta) \\
\sin (\theta) & \cos (\theta)
\end{array}\right]$$

的集合，其中 $\theta \in [0, 2\pi]$，我们把旋转矩阵 $M$ 表示的空间 $SO(2)$ 记作 *original space(原始空间)*，把用角度 $\theta$ 表示的空间记作 *representation space(表示空间)*.

那么根据上面的表达式，我们可以得到一个从原始空间到表示空间的映射 $g: M\rightarrow \theta$，如图所示

<center>![](/content-images/external/99c5369e0eabfd5c21160a676f7d18fa.png)</center>

由于 $\theta$ 在两端点 $0, 2\pi$ 的不连续，导致了映射 $g$ 是一个不连续的映射，因此使用角度 $\theta$ 这样的旋转表示，可能使得神经网络的训练不收敛。

而 $M$ 中的向量 $[\cos\theta, \sin\theta]^{T}$ 是一个连续的旋转表示，因此可以作为深度学习的特征。

> **Definition 1. Continuous Representation(连续表示).** 如图所示，
> <center>![](/content-images/external/dad21ac8c01188007c33736f57b43045.png)</center> 
> 
> - 表示空间 $R$ 是实向量空间的一个子空间，神经网络在接受输入信号后，输出空间 $R$ 下的特征表示。
> - 原始空间 $X$ 是一个紧空间，神经网络的输出可以被映射到空间 $X$ 中。
> - 映射 $f: R \rightarrow X$ 将特征映射到原始空间。
> - 映射 $g: X \rightarrow R$ 将特征映射到表示空间。
> 
> 我们称 $(f, g)$ 是一个 *representation(表示)*，当且仅当对于所有的 $x\in X$ 有 $$f(g(x)) = x$$ 若映射 $g$ 是连续的，则 $(f,g)$ 是一个 *continuous representation(连续表示)*.

---

## *2. Discontinuous Rotation Representations(不连续的旋转表示)*

> **Theorem 2. Discontinuous of Euler.** 设原始空间 $X = SO(3)$，则欧拉角
> $$R_{r p y}(\phi, \theta, \psi)=R_Z(\phi) R_Y(\theta) R_X(\psi)$$ 对应的旋转表示 $(\phi, \theta, \psi)$ 是不连续的表示。

和 *2D* 旋转类似，在 $0,2\pi$ 点上的不连续性，导致了映射

$$g: R_{r p y} \rightarrow \phi, \theta, \psi$$

是不连续的，因此欧拉角表示是不连续的表示。

> **Theorem 3. Discontinuous of Quaternion.** 设原始空间 $X = SO(3)$，则四元数
> $$q =a+b i+c j+d k $$ 所对应的旋转表示 $[a,b,c,d] \in \mathbb{R}^{4}$ 是不连续的表示。

我们需要计算表示空间的映射 $g$，也就是旋转矩阵 $M$ 转四元数，我们知道旋转四元数

$$q = [\cos{\frac{\theta}{2}}, a\sin\frac{\theta}{2}]$$

其中 $\theta,a$ 分别是旋转角与旋转轴，首先计算 $\theta$ 的余弦值

$$\cos\theta = \frac{\operatorname{tr}M - 1}{2}$$

记 $t = \operatorname{tr}M + 1$，由半角公式可以得到

$$\cos\frac{\theta}{2} = \pm \sqrt{\frac{1+\cos\theta}{2}} = \pm \frac{\sqrt{t}}{2}$$

接下来计算旋转轴部分，当 $t\neq 0$ 时，记向量

$$D = \left[\begin{array}{l}
M_{32}-M_{23} \\
M_{13}-M_{31} \\
M_{21}-M_{12}
\end{array}\right]$$

则根据二倍角公式有

$$a\sin\frac{\theta}{2} = \frac{\sin\frac{\theta}{2}}{2\sin\theta}D = \frac{1}{4\cos\frac{\theta}{2}}D = \pm\frac{1}{2\sqrt{t}}D$$

这里的正负号可以任取，因此合起来就是

$$q = \frac{1}{2\sqrt{t}}[t, D]$$

当 $t = 0$ 时，旋转轴

$$a=\left[\sqrt{\frac{\left(M_{11}+1\right)}{2}}, c_y \sqrt{\frac{\left(M_{22}+1\right)}{2}}, c_z \sqrt{\frac{\left(M_{33}+1\right)}{2}}\right]^T$$

其中

$$c_y=\left\{\begin{array}{ll}
1 & \text { if } M_{12} \geq 0 \\
-1 & \text { if } M_{12}<0
\end{array}, \quad c_z= \begin{cases}\operatorname{sgn}\left(M_{23}\right) & \text { if } M_{13}=0 \\
\operatorname{sgn}\left(M_{13}\right) & \text { if } M_{13} \neq 0\end{cases}\right.$$

因此表示空间的映射就是

$$g_{p}(M) = \begin{cases}{\frac{1}{2 \sqrt{t}}\left[t, M_{32}-M_{23}, M_{13}-M_{31}, M_{21}-M_{12}\right]^T} & \text { if } t \neq 0 \\ {\frac{1}{\sqrt{2}}\left[0, \sqrt{M_{11}+1}, c_2 \sqrt{M_{22}+1}, c_3 \sqrt{M_{33}+1}\right]^T} & \text { if } t=0\end{cases}$$

我们发现当 $t$ 趋近于 $0$ 时，有

$$\lim _{t \rightarrow 0} g_{p}(M) = [0, 0, 0, 0]$$

而当 $t=0$ 时，$g_{p}(M)\neq 0$，因此映射 $g$ 在 $t=0$ 这个点上是不连续的，也就是说四元数表示是不连续的。

---

## *3. Continuous Representations(连续表示)*

> **Theorem 4.** *3d* 旋转群 $SO(3)$ 与 *real projective space(实射影空间)*
> $$\mathbb{R} P^3 = \mathbb{R}^{n+1} \backslash\{0\}$$ 在等价关系 $x \sim \lambda x,\lambda \neq 0$ 下同坯，根据 *standard topology embedding(标准拓扑嵌入)* 的相关理论，$\mathbb{R} P^3$ 可以嵌入欧式拓扑空间 $\mathbb{R}^d$，当且仅当 $d\geq 5$.

这个定理告诉我们，连续的旋转表示需要至少 *5d* 的向量，要证明它，需要很多拓扑学的知识，这里留坑待填。

之前我们讨论的旋转表示，像是欧拉角、轴角、四元数这样的小于 *5d* 的都是不连续的表示，如何寻找一个连续的表示呢？

最自然的想法就是直接用 *9d* 的旋转矩阵，我们选择表示空间 $\mathbb{R}^{3\times 3}$ 作为神经网络的输出，并考虑它与 $SO(3)$ 的映射关系。

我们知道旋转矩阵 $M\in SO(3)$ 需要满足 $M$ 是正交阵且 $\det(M)=1$ 的约束，那么对于表示空间 $\mathbb{R}^{3\times 3}$ 中的一个矩阵 $N$，首先需要对其正交化来映射到 $M$，这里我们可以使用 *Gram-Schmidt(施密特正交化)* 方法。

> **Method 5. Gram-Schmidt.** 对于 $\mathbb{R}^{n}$ 空间内的一组向量 $\{v_{1},v_{2},\cdots, v_{k}\}$，其中$k\leq n$，我们可以用如下方法得到空间下的一组正交基
> $$\begin{aligned}
b_1 & =N\left(v_1\right) \\
b_2 & =N\left(v_2-\operatorname{proj}_{b_1}\left(v_2\right)\right) \\
b_3 & =N\left(v_3-\operatorname{proj}_{b_1}\left(v_3\right)-\operatorname{proj}_{b_2}\left(v_3\right)\right) \\
 &\dots \\
b_k & =N\left(v_k-\sum_{j=1}^{k-1} \operatorname{proj}_{b_j}\left(v_k\right) \right)
\end{aligned}$$  其中 $N(v)$ 表示将向量 $v$ 正则化，向量 $v$ 在向量 $b$ 上的投影函数 $$\operatorname{proj}_{b}\left(v\right) = \frac{v\cdot b}{\|b\|^{2}} b$$

但是直接使用 *Gram-Schmidt* 方法将 $N$ 正交化后无法保证 $\det(N)=1$，事实上它的值也有可能是 $-1$，为了解决这个问题，我们引入广义叉积的概念。

> **Definition 6. Generalized Cross Product(广义叉积).** 我们熟知 $\mathbb{R}^{3}$ 空间下的两个向量 $v_{1},v_{2}$ 的叉积定义为
> $$v_{1} \times v_{2}=\det \left[\begin{array}{ccc}
\mid & \mid & \mathbf{i} \\
v_1 & v_2 & \mathbf{j} \\
\mid & \mid & \mathbf{k}
\end{array}\right]$$ 类似的，我们设 $\mathbb{R}^{n}$ 空间下的 $n$ 个 *standard unit vector(标准单位向量)* 为 $\mathbf{e}_{1},\cdots,\mathbf{e}_{n}$，对于空间下的一族向量 $v_{1},\cdots,v_{n-1}$，定义他们的 *generalized cross product(广义叉积)* 为
> $$\operatorname{cross}\left(v_0, \ldots, v_{n-1}\right) = \operatorname{det}\left[\begin{array}{ccc} 
\mid &  & \mid & \mathbf{e}_{1}\\
v_{1} & \cdots & v_{n-1} & \vdots\\
\mid &  & \mid & \mathbf{e}_{n}
\end{array}\right]$$

我们发现只需要把 *Gram-Schmidt* 中的最后一个基 $b_{k}$ 换成前 $k-1$ 个基的广义叉积，就能保证正交化后 $N$ 的行列式为 $1$，因此最后一个向量 $v_{k}$ 实际上是没有作用的，我们可以把它直接丢掉。

据此我们写出表示空间的映射

$$g_{\mathrm{GS}}\left(\left[\begin{array}{ccc}
\mid & & \mid \\
a_1 & \ldots & a_n \\
\mid & & \mid
\end{array}\right]\right)=\left[\begin{array}{ccc}
\mid & & \mid \\
a_1 & \ldots & a_{n-1} \\
\mid & & \mid
\end{array}\right]$$

至于原始空间的映射，实际上就是把网络的输出 $N$ 进行正交化得到 $M$ 的过程，即

$$f_{\mathrm{GS}}\left(\left[\begin{array}{ccc}
\mid & & \mid \\
a_1 & \ldots & a_{n-1} \\
\mid & & \mid
\end{array}\right]\right)=\left[\begin{array}{ccc}
\mid & & \mid \\
b_1 & \ldots & b_n \\
\mid & & \mid
\end{array}\right]$$

其中

$$b_{i} = \begin{cases}
N\left(a_1\right), & \text{ if } i = 1\\
N\left(a_i-\sum_{j=1}^{i-1}\left(b_j \cdot a_i\right) b_j\right), & \text{ if } 2 \leq i \leq n-1\\
\operatorname{cross}\left(b_0, \ldots, b_{n-1}\right), & \text{ if } i=n
\end{cases}$$

显然我们的 $g_{\mathrm{GS}}$ 是连续函数，因此这样的 $n$ 维旋转表示是连续的表示。

> **Theorem 7. 6D-Representation.** 设原始空间 $X = SO(3)$，我们的 *6d* 旋转表示定义为两个轴向量 $v_{1},v_{2}\in \mathbb{R}^{3}$，对应的表示空间映射为
> $$g_{\mathrm{GS}}(\left[\begin{array}{ccc}
M_{11} & M_{12} & M_{13} \\
M_{21} & M_{22} & M_{23} \\
M_{31} & M_{32} & M_{33}
\end{array}\right]) = \left[\begin{array}{lll}
M_{11} & M_{12} \\
M_{21} & M_{22} \\
M_{31} & M_{32}
\end{array}\right]$$ 原始空间映射为 $$f_{\mathrm{GS}}(\left[ v_{1},  v_{2}\right]) = [b_{1},b_{2},b_{3}]$$ 其中 $$\begin{aligned}
b_{1} &= N(a_{1})\\
b_{2} &= N(a_{2} - (b_{1}\cdot a_{2})b_{1})\\
b_{3} &= b_1 \times b_{2}
\end{aligned}$$

``` python
def rotation_6d_to_matrix(d6: torch.Tensor) -> torch.Tensor:
    """
    Converts 6D rotation representation by Zhou et al. [1] to rotation matrix
    using Gram--Schmidt orthogonalization per Section B of [1].
    Args:
        d6: 6D rotation representation, of size (*, 6)
    Returns:
        batch of rotation matrices of size (*, 3, 3)
    """
    a1, a2 = d6[..., :3], d6[..., 3:]
    b1 = F.normalize(a1, dim=-1)
    b2 = a2 - (b1 * a2).sum(-1, keepdim=True) * b1
    b2 = F.normalize(b2, dim=-1)
    b3 = torch.cross(b1, b2, dim=-1)
    return torch.stack((b1, b2, b3), dim=-2)

```

现在我们得到了 *6d* 的连续旋转表示，但是根据 *theorem 4*，我们希望继续降维得到 *5d* 的连续表示，为此需要引入球极投影的概念。

> **Theorem 8. Stereographic Projection(球极投影).** 考虑 $\mathbb{R}^{3}$ 中的球面 $S^{2}$
> $$\left\{(x, y, z) \in \mathbb{R}^3: x^2+y^2+z^2=1\right\}$$ 取北极点 $N=(0,0,1)$，我们可以构造一个 $S^2 \backslash\{N\}$ 到 $\mathbb{R}^{2}$ 的同坯映射，如图所示
> <center><img src="/content-images/external/c2f2f5215273c3c99197658aee421f58.png" width=500px></center> 
> 对于球面上一点 $P(x_{0},y_{0},z_{0})$，其投影点 $P^{\prime}$ 为直线 $NP$ 与 $XOY$ 平面的交点，直线 $NP$ 的方程为
> $$\frac{x-x_{0}}{x_{0}} = \frac{y-y_{0}}{y_{0}} = \frac{z-z_{0}}{z_{0}-1}$$ 据此可以得到 $P^{\prime} = \left(\frac{x_{0}}{1-z_{0}}, \frac{y_{0}}{1-z_{0}}, 0\right)$，因此有映射 $f: \mathbb{R}^{3} \rightarrow \mathbb{R}^{2}$
> $$f(u) = \left[\frac{v_1}{1-v_3}, \frac{v_2}{1-v_3}\right], \quad v = N(u)$$ 另一方面，对于平面上一点 $P(x_{0},y_{0}, 0)$，其在球面上的投影点 $P^{\prime}$ 为直线 $NP$ 与球面的交点，直线 $NP$ 方程为
> $$\frac{x-x_0}{x_0}=\frac{y-y_0}{y_0}=-z$$ 与球面方程联立得到 $P^{\prime}=\left(\frac{2x_{0}}{x_{0}^{2}+y_{0}^{2}+1}, \frac{2y_{0}}{x_{0}^{2}+y_{0}^{2}+1}, \frac{x_{0}^{2}+y_{0}^{2}-1}{x_{0}^{2}+y_{0}^{2}+1}\right)$，因此有映射 $g:\mathbb{R}^{2} \rightarrow \mathbb{R}^{3}$
> $$g(u) = \left[u_{1}, u_{2}, \frac{1}{2}\left(\|u\|^{2} - 1\right) \right]$$

以上球极投影的结论推广到高维空间依然成立，因此我们只需在 *6d* 表示中使用球极投影，就能得到 *5d* 的旋转表示。


``` python 
def stereographic_project(a):
    dim = a.shape[1]
    a = normalize_vector(a)
    out = a[:,0:dim-1]/(1-a[:,dim-1])
    return out
	
def stereographic_unproject(a, axis=None):
    batch=a.shape[0]
    if axis is None:
        axis = a.shape[1]
    s2 = torch.pow(a,2).sum(1) #batch
    ans = torch.autograd.Variable(torch.zeros(batch, a.shape[1]+1).cuda()) #batch*6
    unproj = 2*a/(s2+1).view(batch,1).repeat(1,a.shape[1]) #batch*5
    if(axis>0):
        ans[:,:axis] = unproj[:,:axis] #batch*(axis-0)
    ans[:,axis] = (s2-1)/(s2+1) #batch
    ans[:,axis+1:] = unproj[:,axis:]	 #batch*(5-axis)		
    # Note that this is a no-op if the default option (last axis) is used
    return ans
```

但是由于 *6d* 表示具有实际的物理意义，可以表示物体的两个位姿轴，因此在实际使用中多数开发者依然会使用 *6d* 表示。



---

## *Reference*

- https://arxiv.org/pdf/1812.07035.pdf
- https://www.bananaspace.org/wiki/%E5%B0%84%E5%BD%B1%E7%A9%BA%E9%97%B4
- https://math.stackexchange.com/questions/1537185/embeddings-of-projective-spaces-into-euclidean-spaces
- https://www.jianshu.com/p/0fefff185947
- https://en.wikipedia.org/wiki/Gram%E2%80%93Schmidt_process
- https://www.bananaspace.org/wiki/%E8%AE%B2%E4%B9%89:%E6%8B%93%E6%89%91%E5%AD%A6/%E6%8B%93%E6%89%91%E7%A9%BA%E9%97%B4%E4%B8%8E%E8%BF%9E%E7%BB%AD%E6%98%A0%E5%B0%84_(I)
- https://github.com/papagina/RotationContinuity/tree/master
