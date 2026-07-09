---
type: markdown
title: Conjugate Gradient
slug: "5499697"
date: 2022-08-19
updatedAt: 2026-06-29 17:18:25
tags:
  - 基础数学
  - 机器学习
published: true
category: mathmatics
---

## *1. Quadratic form(二次型)*

共轭梯度法是解决大型线性方程组 $\mathbf{A} x=b$ 的有力工具，它与二次型函数

$$f(x)=\frac{1}{2} x^{T} \mathbf{A} x-b^{T} x+c$$

息息相关，其中矩阵 $A \in \mathbb{R}^{n\times n}$，向量 $x,b\in \mathbb{R}^{n}$，$c$ 为常数。

> **Theorem 1.** 当 $A$ 为对称正定阵时，二次型 $f(x)$ 的最小值点 $x_{0}$ 和方程组
> $$\mathbf{A} x=b$$ 的根是等价的，其中正定意味着对于任意非零向量 $v$，都有
> $$v^{T} \mathbf{A} v > 0$$

证明：事实上，我们求 $f(x)$ 的梯度可以得到（矩阵微分参考[Matrix Calculus](http://blog.leanote.com/post/chty_syq/Matrix-Calculus)）

$$\nabla_{x} f(x) = \frac{1}{2}(\mathbf{A}x + \mathbf{A}^{T}x) - b = \mathbf{A}x - b$$

令其等于 $0$ 得到 $\mathbf{A}x_{0} = b$，我们得到了一个极值点 $x_{0}$，接下来我们证明这个 $x_{0}$ 是全局最小值点，对于任意的向量 $x \neq x_{0}$，我们有

$$\begin{aligned} f(x) - f(x_{0}) 
&= \left(\frac{1}{2} x^{T}\mathbf{A}x - b^{T}x + c\right) - \left(\frac{1}{2}x_{0}^{T}\mathbf{A}x_{0} - b^{T}x_{0} + c\right) \\
&= \frac{1}{2} x^{T}\mathbf{A}x - (\mathbf{A}x_{0})^{T}x - \frac{1}{2}x_{0}^{T}\mathbf{A}x_{0} + (\mathbf{A}x_{0})^{T}x_{0} \\
&= \frac{1}{2} x^{T}\mathbf{A}x - x_{0}^{T}\mathbf{A}x + \frac{1}{2}x_{0}^{T}\mathbf{A}x_{0} \\
&= \frac{1}{2} (x - x_{0})^{T} \mathbf{A}x - \frac{1}{2} x_{0}^{T}  \mathbf{A} (x - x_{0}) \\
&= \frac{1}{2} (x - x_{0})^{T} \mathbf{A} (x - x_{0}) > 0
\end{aligned}$$

即 $x_{0}$ 是全局最小值点，也就是说我们要求 $\mathbf{A}x = b$ 的解，只需要求解 $f(x)$ 的最小值即可，我们把求解线性方程组的问题转化为了一个优化问题。

---

## *2. Gradient Descent(梯度下降)*

对于优化问题

$$x^{*} = \underset{x}{\operatorname{argmin}}f(x)$$

我们从初始值 $x^{(0)}$ 开始，每次沿着函数值减小最快的方向（梯度方向）走一步，得到

$$x^{(k+1)} = x^{(k)} - \alpha \nabla_{x} f(x)|_{x=x^{(k)}} $$

为了书写方便，我们记

- 误差向量 $e^{(k)} = x^{(k)} - x^{*}$， 表示第 $k$ 步距离目标点的距离。
- 方向向量 $r^{(k)} = b - \mathbf{A}x^{(k)}$，表示第 $k$ 步的梯度方向的反方向。

> **Lemma 1.** 误差向量 $e^{(k)}$ 与方向向量 $r^{(k)}$ 满足
> $$r^{(k)} = -\mathbf{A} e^{(k)}$$

现在我们需要确定每次的步长 $\alpha$ 使得迭代尽可能快的收敛，也就是说 $\alpha$ 的取值应该使得 $f(x^{(k+1)})$ 的值最小，令

$$\begin{aligned}\nabla_{\alpha}f(x^{(k+1)}) 
&= \nabla_{\alpha}f(x^{(k)}+\alpha r^{(k)}) \\
&= f^{\prime}(x^{(k+1)})^{T}\cdot r^{(k)} = -(r^{(k+1)})^{T} r^{(k)} = 0
\end{aligned}$$

我们得到 $\alpha$ 的取值应使得第 $k$ 和 $k+1$ 步的前进方向正交，进一步推到可以得到 $\alpha$ 的表达式

$$\begin{aligned}(r^{(k+1)})^{T}r^{(k)} 
&= (b - \mathbf{A}x^{(k+1)})^{T}r^{(k)} \\
&= (b - \mathbf{A}x^{(k)} - \alpha \mathbf{A} r^{(k)})^{T}r^{(k)} \\
&= (r^{(k)} - \alpha \mathbf{A} r^{(k)})^{T}r^{(k)} \\
&= (r^{(k)})^{T}r^{(k)} - \alpha (r^{(k)})^{T}\mathbf{A} r^{(k)}\\
&= 0
\end{aligned}$$

得到 

$$\alpha^{(k)} = \frac{(r^{(k)})^{T}r^{(k)}}{(r^{(k)})^{T}\mathbf{A} r^{(k)}}$$

> **Method 1.** 梯度下降求解线性方程组 $\mathbf{A} x = b$ 的算法流程如下：
> 
> 1. 初始化 $x^{(0)} = \text{Random Vector}$
> 2. 枚举 $k = 0,1,\cdots, \infty$
>   * 计算 $r^{(k)} = b - \mathbf{A} x^{(k)}$
>   * 计算 $\alpha = \frac{(r^{(k)})^{T}r^{(k)}}{(r^{(k)})^{T}\mathbf{A} r^{(k)}}$
>   * 更新 $x^{(k+1)} = x^{(k)} + \alpha \cdot r^{(k)}$
>   * 如果 $||x^{(k+1)} - x^{(k)}|| < \text{eps}$，算法结束

---

## *3. Conjugate Gradient Descent(共轭梯度下降)*

在梯度下降中，我们通过调整步长 $\alpha$ 使得相邻两次前进的方向是正交的，但是并没有保证搜索方向两两正交，这样就可能出现在同一个搜索方向上前进多次，我们想要避免这种情况。

我们希望选择一组两两正交的搜索方向 $d^{(0)},d^{(1)},\cdots,d^{(n-1)}$，在每个方向上仅前进一步，消除误差向量在这个方向上的分量，这样的话梯度下降一定会在 $n$ 步迭代后收敛。

$$x^{(k+1)} = x^{(k)} + \alpha d^{(k)}$$

利用第 $k$ 轮迭代后的误差向量 $e^{(k+1)}$ 与搜索方向 $d^{(k)}$ 正交的关系，可以确定步长

$$e^{(k+1)}\cdot d^{(k)} = (e^{k} + \alpha d^{(k)})^{T} d^{(k)}\quad \Rightarrow \quad \alpha = \frac{(e^{(k)})^{T}d^{(k)}}{(d^{(k)})^{T}d^{(k)}}$$

但是由于误差向量 $e^{(k)}$ 是未知的量，我们仍然无法求出步长 $\alpha$ 的值，我们的解决方案是用 *A-orthogonal(矩阵向量正交)* 代替向量正交，即

$$d^{(i)}\mathbf{A}d^{(j)} = 0,\quad i\neq j$$

现在我们的搜索条件就变成了确定 $\alpha$ 使得误差向量 $e^{(k+1)}$ 与搜索方向 $d^{(k)}$ 矩阵正交，这与最小化 $f(x^{(k+1)})$ 是等价的，令

$$\nabla_{\alpha} f(x^{(k+1)}) = f^{\prime}(x^{(k+1)})^{T} \nabla_{\alpha}x^{(k+1)} =  -(r^{(k+1)})^{T}d^{(k)} = 0$$

应用 *Lemma 1* 得到

$$-(r^{(k+1)})^{T}d^{(k)} = e^{(k+1)}\mathbf{A} d^{(k)} = 0$$

由这个条件可以确定步长

$$\alpha = -\frac{(e^{(k)})^{T}\mathbf{A}d^{(k)}}{(d^{(k)})^{T}\mathbf{A}d^{(k)}} = \frac{(r^{(k)})^{T}d^{(k)}}{(d^{(k)})^{T}\mathbf{A}d^{(k)}}$$

> **Theorem 2.** 在搜索方向 $d^{(0)},d^{(1)},\cdots,d^{(n-1)}$ 关于 $\mathbf{A}$ 两两矩阵正交的条件下，即对于任意的 $i\neq j$ 有
> $$d^{(i)}\mathbf{A}d^{(j)} = 0$$ 梯度下降一定能在 $n$ 步迭代后收敛。

我们初始误差向量 $e^{(0)}$ 表示为 $d$ 的线性组合

$$e^{(0)} = \sum_{j=0}^{n-1} \delta^{(j)} d^{(j)}$$

为了确定 $d_{(j)}$ 的值，我们两边乘上 $(d^{(k)})^{T} \mathbf{A}$ 得到

$$(d^{(k)})^{T} \mathbf{A} e^{(0)} = \sum_{j=0}^{n-1} \delta^{(j)}(d^{(k)})^{T} \mathbf{A} d^{(j)} = \delta^{(k)}(d^{(k)})^{T} \mathbf{A} d^{(k)}$$

得到

$$\delta^{(k)} = \frac{(d^{(k)})^{T} \mathbf{A} e^{(0)}}{(d^{(k)})^{T} \mathbf{A} d^{(k)}} = \frac{(d^{(k)})^{T} \mathbf{A} e^{(k)}}{(d^{(k)})^{T} \mathbf{A} d^{(k)}}$$

这是因为

$$\begin{aligned}(d^{(k)})^{T} \mathbf{A} e^{(k)} 
&= (d^{(k)})^{T} \mathbf{A} \left(e^{(0)} + \sum_{j=0}^{k-1} \alpha^{(j)}d^{(j)} \right)\\
&= (d^{(k)})^{T} \mathbf{A}e^{(0)} + \sum_{j=0}^{k-1}\alpha^{(j)} (d^{(k)})^{T} \mathbf{A}d^{(j)}\\
&= (d^{(k)})^{T} \mathbf{A}e^{(0)} 
\end{aligned}$$

我们观察到 $\delta^{(k)} = -\alpha^{(k)}$，也就是说我们梯度下降的每一步实际上是消除了误差向量 $e$ 在方向 $d^{(k)}$ 上的分量，$n$ 轮迭代后，所有的分量都被消除，算法收敛，证毕。

现在我们只需要找到关于矩阵 $\mathbf{A}$ 两两正交的一组搜索方向就行了。

我们令 $d^{(0)} = r^{(0)}$，我们知道它与 $r^{(1)}$ 是正交的，设

$$d^{(1)} = \beta d^{(0)} + r^{(1)}$$

根据矩阵正交的条件我们得到

$$(d^{(0)})^{T}\mathbf{A}d^{(1)}=0 \quad \Rightarrow \quad \beta = -\frac{(d^{(0)})^{T}\mathbf{A}r^{(1)}}{(d^{(0)})^{T}\mathbf{A}d^{(0)}}$$

我们令

$$d^{(k+1)} = \beta d^{(k)} + r^{(k+1)}$$

得到

$$\beta = -\frac{(d^{(k)})^{T}\mathbf{A}r^{(k+1)}}{(d^{(k)})^{T}\mathbf{A}d^{(k)}}$$

由数学归纳法可以证明得到的 $d$ 是关于 $\mathbf{A}$ 两两正交的。

> **Method 2.** 共轭梯度下降求解线性方程组 $\mathbf{A} x = b$ 的算法流程如下：
> 
> 1. 初始化 $x^{(0)} = \text{random}, d^{(0)} = r^{(0)}=\mathbf{A}x^{(0)}-b$
> 2. 枚举 $k = 0,1,\cdots, \infty$
>   * 计算 $\alpha = \frac{(r^{(k)})^{T}d^{(k)}}{(d^{(k)})^{T}\mathbf{A}d^{(k)}}$
>   * 更新 $x^{(k+1)} = x^{(k)} + \alpha \cdot d^{(k)}$
>   * 计算 $r^{(k+1)} = \mathbf{A}x^{(k+1)} - b$
>   * 计算 $\beta^{(k+1)} = -\frac{(d^{(k)})^{T}\mathbf{A}r^{(k+1)}}{(d^{(k)})^{T}\mathbf{A}d^{(k)}}$
>   * 计算 $d^{(k+1)} = \beta^{(k+1)} d^{(k)} + r^{(k+1)}$
>   * 如果 $||x^{(k+1)} - x^{(k)}|| < \text{eps}$，算法结束
