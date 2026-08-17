---
type: markdown
title: CS229 Note(4) 支持向量机(下)
slug: "1300659"
order: 29
date: 2021-11-25
updatedAt: 2026-07-10 21:23:01
tags:
  - 机器学习
  - CS229
published: true
category: machine-learning
---

书接上文，我们的目标是找到一个超平面把正负样本分割开，并且样本的几何间隔尽可能的小，在一系列的推导后，我们把问题刻画成了一个凸优化问题，可以直接由软件跑出结果。

为了更高效的解决问题，我们找到了它的对偶问题，并在推导的过程中发现了很好的性质，但是还有几个问题需要解决

- 在推导过程中，我们假设原始问题满足 *Slater* 条件，即存在一个超平面可以将两类样本分隔开，我们需要移除这个假设。
- 在对偶问题中，我们需要求解 $\alpha$ 使得 $W(\alpha)$ 的值最大，我们需要给出这个求解算法。

在解决这些问题之前，我们先来介绍一下核方法。

## *1. Kernel Method(核方法)*

现在假设我们有一个函数 $\phi : \mathbb{R} \rightarrow \mathbb{R}^{4}$，把输入特征 $x$ 映射在四维空间中

$$\phi(x)=\left[\begin{array}{c}
1 \\
x \\
x^{2} \\
x^{3}
\end{array}\right] \in \mathbb{R}^{4}$$

我们把 $\phi$ 叫做 *feature map(特征映射)*，它把问题的输入特征映射为了高维空间下的一组新特征。

在上文的最后，我们讲到了 SVM 的预测函数，它需要计算 $\left\langle x^{(i)}, x^{(j)}\right\rangle$，如果我们使用核方法将样本特征 $x$ 映射到高维空间得到 $\phi(x)$，则需要计算 

$$ K(x^{(i)},x^{(j)}) = \left\langle \phi(x^{(i)}), \phi(x^{(j)})\right\rangle$$

其中 $K$ 是 *kernal function(核函数)*，事实上，很多时候求解 $\phi(x^{(i)})$ 的代价是很高的，甚至无法求解，而计算 $K(x^{(i)},x^{(j)})$ 却很容易，我们举一些例子来说明这一点。

> **Example 1.** 设 $x,z\in \mathbb{R}^{d}$，且核函数 $$K(x, z)=\left(x^{T} z\right)^{2}$$ 我们可以把它写成
> $$\begin{aligned}
K(x, z) &=\left(\sum_{i=1}^{d} x_{i} z_{i}\right)\left(\sum_{j=1}^{d} x_{j} z_{j}\right) \\
&=\sum_{i=1}^{d} \sum_{j=1}^{d} x_{i} x_{j} z_{i} z_{j} \\
&=\sum_{i, j=1}^{d}\left(x_{i} x_{j}\right)\left(z_{i} z_{j}\right)
\end{aligned}$$ 这样的话，$K(x, z)=\langle\phi(x), \phi(z)\rangle$ 对应的特征映射 $\phi$ 就是
> $$\phi(x)=\left[\begin{array}{c}
x_{1}x_{1} \\
x_{1}x_{2} \\
x_{1}x_{3} \\
x_{2}x_{1} \\
x_{2}x_{2} \\
x_{2}x_{3} \\
x_{3}x_{1} \\
x_{3}x_{2} \\
x_{3}x_{3} \\
\end{array}\right], \text{shown as } d=3$$
> 显然直接计算 $\phi(x)$ 的代都是 $O(d^{2})$ 的，而计算核函数 $K(x,z)$ 的代价为 $O(d)$.

我们稍作改动，来看下一个例子：

> **Example 2.** 设 $x,z\in \mathbb{R}^{d}$，且核函数 $$K(x, z)=\left(x^{T} z+c\right)^{2}$$ 其中 $c$ 是一个常数，我们可以把它写成
> $$\begin{aligned}
K(x, z) &=\left(x^{T} z+c\right)^{2} \\
&=\sum_{i, j=1}^{d}\left(x_{i} x_{j}\right)\left(z_{i} z_{j}\right)+\sum_{i=1}^{d}\left(\sqrt{2 c} x_{i}\right)\left(\sqrt{2 c} z_{i}\right)+c^{2}
\end{aligned}$$ 对应的特征映射
> $$\phi(x)=\left[\begin{array}{c}
x_{1} x_{1} \\
x_{1} x_{2} \\
x_{1} x_{3} \\
x_{2} x_{1} \\
x_{2} x_{2} \\
x_{2} x_{3} \\
x_{3} x_{1} \\
x_{3} x_{2} \\
x_{3} x_{3} \\
\sqrt{2 c} x_{1} \\
\sqrt{2 c} x_{2} \\
\sqrt{2 c} x_{3} \\
c
\end{array}\right]$$

更一般的，对于 $K(x, z)=\left(x^{T} z+c\right)^{k}$，计算其对应的特征映射需要 $O(d^{k})$ 的代价，而计算 $K$ 则是 $O(d)$ 的。

使用内积的好处在于，如果 $x,z$ 比较相似，那么 $\phi(x),\phi(z)$ 的方向较为相近，$\langle\phi(x), \phi(z)\rangle$ 的值就会较大。

所以我们在定义核函数 $K(x,z)$ 的时候，$K$ 应该能够度量 $x,z$ 之间的相似度，例如 *Gaussian kernel(高斯核)*

$$K(x, z)=\exp \left(-\frac{\|x-z\|^2}{2 \sigma^2}\right)$$

接下来我们需要判断一个核函数 $K$ 是否是有效的，即存在 $\phi$ 使得

$$K(x,z) = \langle\phi(x), \phi(z)\rangle$$

我们假设 $K$ 是一个有效的核，那么对于任意一组 $\left\{x^{(1)}, \ldots, x^{(n)}\right\}$ 定义 *kernal matrix(核矩阵)*

$$K_{i j}=K\left(x^{(i)}, x^{(j)}\right)$$

我们注意到矩阵 $K$ 是对称的，且对于任意的向量 $z$ 有

$$\begin{aligned}
z^T K z & =\sum_i \sum_j z_i K_{i j} z_j \\
& =\sum_i \sum_j z_i \phi\left(x^{(i)}\right)^T \phi\left(x^{(j)}\right) z_j \\
& =\sum_i \sum_j z_i \sum_k \phi_k\left(x^{(i)}\right) \phi_k\left(x^{(j)}\right) z_j \\
& =\sum_k \sum_i \sum_j z_i \phi_k\left(x^{(i)}\right) \phi_k\left(x^{(j)}\right) z_j \\
& =\sum_k\left(\sum_i z_i \phi_k\left(x^{(i)}\right)\right)^2 \\
& \geq 0 .
\end{aligned}$$


因此矩阵 $K$ 是半正定的，这就是核函数有效的一个必要条件，而且我们可以证明它同时也是充分的。

> **Theorem 1 (Mercer's Theorem).** 对于给定的核函数 $K: \mathbb{R}^d \times \mathbb{R}^d \mapsto \mathbb{R}$，它是有效核的充要条件为，对于任意的 
> $$\left\{x^{(1)}, \ldots, x^{(n)}\right\},(n<\infty)$$ 对应的核矩阵是半正定对称阵。

现在回到 *SVM* 问题上，还记得我们推导出的预测函数

$$h_{w,b}(x) = g(w^{T}x+b) = g(\sum_{i=1}^{n}\alpha_{i}y^{(i)} \langle x^{(i)}, x \rangle +b)$$

现在我们通过核函数将输入的特征向量映射到高维空间，即 $x^{(i)}\rightarrow \phi(x^{(i)})$，将内积替换为

$$\langle x^{(i)}, x \rangle \rightarrow K(x^{(i)}, x)$$

这样做的好处在于，输入特征在低位空间内通常都不是线性可分的，而映射到高维空间后，有很大的可能是线性可分的。


---

## *2. Non-separable Case(线性不可分的情况)*

还记得我们的优化问题是

$$\begin{aligned}
\min _{w, b} &\quad \frac{1}{2}\|w\|^{2} \\
\text { s.t. } &\quad y^{(i)}\left(w^{T} x^{(i)}+b\right) \geq 1, \quad i=1, \ldots, n
\end{aligned}$$

我们假设样本数据集满足 *Slatter* 条件，即存在一个超平面可以在高维空间内把两类样本点划分开，但是如果不满足这个假设，我们使用 $\ell_1$ 正则引入惩罚项

$$\begin{aligned}
\min _{w, b, \xi} & \quad \frac{1}{2}\|w\|^2+C \sum_{i=1}^n \xi_i \\
\text { s.t. } & \quad y^{(i)}\left(w^T x^{(i)}+b\right) \geq 1-\xi_i, \quad i=1, \ldots, n \\
& \quad \xi_i \geq 0, \quad i=1, \ldots, n .
\end{aligned}$$

即我们允许样本点的函数间隔小于 $1$，且在优化目标上加上相应的惩罚，其中 $C$ 为常数，用于调整权重来保证大部分的样本点被正常划分。

我们可以写出广义拉格朗日算子

$$\mathcal{L}(w, b, \xi, \alpha, r)=\frac{1}{2} w^T w+C \sum_{i=1}^n \xi_i-\sum_{i=1}^n \alpha_i\left[y^{(i)}\left(x^T w+b\right)-1+\xi_i\right]-\sum_{i=1}^n r_i \xi_i .$$

结合 *KKT* 条件得到对偶问题

$$\begin{aligned}
\max _\alpha &\quad W(\alpha)=\sum_{i=1}^n \alpha_i-\frac{1}{2} \sum_{i, j=1}^n y^{(i)} y^{(j)} \alpha_i \alpha_j\left\langle x^{(i)}, x^{(j)}\right\rangle \\
\text { s.t. } &\quad 0 \leq \alpha_i \leq C, \quad i=1, \ldots, n \\
&\quad \sum_{i=1}^n \alpha_i y^{(i)}=0
\end{aligned}$$

且最优解对应的 $\alpha_{i}^{*}, r_{i}^{*}$ 满足 *KKT* 条件

$$\begin{aligned}
\alpha_{i}^{*}\left[y^{(i)}\left(x^T w+b\right)-1+\xi_i\right] = 0 \\
r_{i}^{*} \xi_i = 0 \\
\alpha_{i}^{*} + r_{i}^{*} = C \\
\left[y^{(i)}\left(x^T w+b\right)-1+\xi_i\right] \geq 0 \\
\alpha_{i}^{*}, r_{i}^{*} ,\xi_{i} \geq 0
\end{aligned}$$

当 $\alpha_{i}^{*} = 0$ 时，$r_{i}^{*} = C$，$\xi_{i}^{*}=0$，有

$$y^{(i)}\left(x^T w+b\right)\geq 1 - \xi_{i}^{*} = 1$$

当 $\alpha_{i}^{*} = C$ 时，有

$$y^{(i)}\left(x^T w+b\right) = 1 - \xi_{i}^{*} \leq 1$$

当 $0< \alpha_{i}^{*} < C$ 时，$\xi_{i}^{*}=0$，有

$$y^{(i)}\left(x^T w+b\right) = 1 - \xi_{i}^{*} = 1$$

因此，在求解这个对偶问题时，我们有收敛性条件

$$\begin{aligned}
\alpha_i=0 & \Rightarrow y^{(i)}\left(w^T x^{(i)}+b\right) \geq 1 \\
\alpha_i=C & \Rightarrow y^{(i)}\left(w^T x^{(i)}+b\right) \leq 1 \\
0<\alpha_i<C & \Rightarrow y^{(i)}\left(w^T x^{(i)}+b\right)=1 .
\end{aligned}$$

---

## *3. The SMO Algorithm(SMO算法)*

在解决对偶优化问题时，我们有一个非常高效的算法，它是基于 *coordinate ascent(坐标上升)* 算法的。

> **Method 1. Coordinate Ascent(坐标上升).** 对于无约束优化问题
> $$\max _\alpha W\left(\alpha_1, \alpha_2, \ldots, \alpha_n\right)$$ 坐标上升算法的流程如下
> 
1. 枚举 $i = 1,  2,\ldots n$
2. 赋值 $\alpha_i:=\arg \max _{\hat{\alpha}_i} W\left(\alpha_1, \ldots, \alpha_{i-1}, \hat{\alpha}_i, \alpha_{i+1}, \ldots, \alpha_n\right) .$
3. 重复执行 1,2 直到算法收敛

也就是说，我们每次选取一个 $\alpha_{i}$，固定其它的 $\alpha$ 不变，调整 $\alpha_{i}$ 使得 $W$ 的值增大。

相较于之前学过的梯度下降和牛顿法，坐标上升法每次仅选择单一维度坐标进行迭代，其好处在于极值点更容易计算，求解 $\alpha_{i}$ 的效率较高，但是所需的迭代次数较高。

我们不能把它直接应用于我们的对偶优化问题

$$\begin{aligned}
\max _\alpha &\quad W(\alpha)=\sum_{i=1}^n \alpha_i-\frac{1}{2} \sum_{i, j=1}^n y^{(i)} y^{(j)} \alpha_i \alpha_j\left\langle x^{(i)}, x^{(j)}\right\rangle . \\
\text { s.t. } &\quad 0 \leq \alpha_i \leq C, \quad i=1, \ldots, n \\
&\quad \sum_{i=1}^n \alpha_i y^{(i)}=0 .
\end{aligned}$$

因为我们有约束条件 $\sum_{i=1}^n \alpha_i y^{(i)}=0$，现在我们选取两个 $\alpha_{1},\alpha_{2}$，它们满足

$$\alpha_1 y^{(1)}+\alpha_2 y^{(2)}=-\sum_{i=3}^n \alpha_i y^{(i)} = \zeta$$

它们之间的约束关系如图所示

<center> 
![enter image description here](/content-images/external/4f4e2fbf1fed944517eda5c65b5eb0e3.png)
</center>

图示的例子中，$\alpha_{2} \in [0, H]$，更一般的，$\alpha_{2} \in [L,H]$，且

$$\alpha_1 =\frac{\left(\zeta-\alpha_2 y^{(2)}\right)}{y^{(1)}}=\left(\zeta-\alpha_2 y^{(2)}\right) y^{(1)}$$

这是因为 $y \in \{-1 ,1\}$，因此，我们的目标函数

$$W\left(\alpha_1, \alpha_2, \ldots, \alpha_n\right)=W\left(\left(\zeta-\alpha_2 y^{(2)}\right) y^{(1)}, \alpha_2, \ldots, \alpha_n\right)$$

展开后可以发现，这是一个关于 $\alpha_{2}$ 的二次函数，可以快速求出其极值点 $\alpha_2^{n e w, \text { unclipped }}$，然后根据其取值范围进行裁剪操作

$$\alpha_2^{\text {new }}= \begin{cases}H & \text { if } \alpha_2^{\text {new,unclipped }}>H \\ \alpha_2^{\text {new,unclipped }} & \text { if } L \leq \alpha_2^{\text {new, unclipped }} \leq H \\ L & \text { if } \alpha_2^{\text {new,unclipped }}<L\end{cases}$$

这样我们就完成了一次迭代，在坐标上升算法的循环中，我们每次选取两个 $\alpha_{i},\alpha_{j}$ 进行这样的迭代，直至收敛，这就是我们的 *sequential minimal optimization(SMO)* 算法。

> **Method 2 (SMO算法).** 对于 *SVM* 的对偶优化问题
> $$\begin{aligned}
\max _\alpha &\quad W(\alpha)=\sum_{i=1}^n \alpha_i-\frac{1}{2} \sum_{i, j=1}^n y^{(i)} y^{(j)} \alpha_i \alpha_j\left\langle x^{(i)}, x^{(j)}\right\rangle . \\
\text { s.t. } &\quad 0 \leq \alpha_i \leq C, \quad i=1, \ldots, n \\
&\quad \sum_{i=1}^n \alpha_i y^{(i)}=0 .
\end{aligned}$$ *SMO* 算法的流程如下
> 
1. 选取合适的 $\alpha_{i},\alpha_{j}$
2. 固定其它的 $\alpha$ 不变，计算
$$\alpha_{j}^{\text {new,unclipped }} = \arg\min _{\alpha_j} W\left(\left(\zeta-\alpha_j y^{(j)}\right) y^{(i)}, \alpha_j, \ldots, \alpha_n\right)$$
3. 计算 $\alpha_{j}$ 的取值范围 $[L,H]$
4. 赋值 
$$\alpha_j^{\text {new }}= \begin{cases}H & \text { if } \alpha_j^{\text {new,unclipped }}>H \\ \alpha_j^{\text {new,unclipped }} & \text { if } L \leq \alpha_j^{\text {new, unclipped }} \leq H \\ L & \text { if } \alpha_j^{\text {new,unclipped }}<L\end{cases}$$
5. 赋值
$$\alpha_{i}^{\text{new}}=\left(\zeta-\alpha_j y^{(j)}\right) y^{(i)}$$
3. 重复执行 1~5 直到算法收敛


最后我们遗留下来两个问题

- *SMO* 算法如何选取合适的 $\alpha_{i},\alpha_{j}$
- 通过求解出的 $\alpha$ 可以根据 *KKT* 条件直接得到参数 $W$ 的值，如何得到相应的 $b$ 呢？

这些问题较为复杂，在 [*Platt’s* 的论文](http://cs229.stanford.edu/materials/smo.pdf)中有详细的过程，留坑。
