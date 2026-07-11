---
type: markdown
title: CS229 Note(3) 支持向量机(上)
slug: "1031988"
order: 29
date: 2021-11-19
updatedAt: 2026-07-10 21:23:01
tags:
  - 机器学习
  - CS229
published: true
category: machine-learning
---

## *1. Margins(间隔)*

我们从 *margins(间隔)* 开始讨论支持向量机的内容，在逻辑回归中，我们用 *logistic function* 对 $\mathbb{P}(y|x)$ 进行建模

$$h_{\theta}(x) = g(\theta^{T}x) = \frac{1}{1+e^{-\theta^{T}x}}$$

当 $h_{\theta}(x) \geq 0.5$ 时，我们预测对应的 $y = 1$，且 $\theta^{T}x$ 的值越大，我们的预测越可信。

<center>
![title](/content-images/external/16e82f8620aecf259c7123f56904d444.png)
</center>

如图所示，X 代表 $y=1$ 的样本点，O 代表 $y=0$ 的样本点，中间的直线则是我们的 *decision boundary(决策边界)*.

预测点 $A$ 距离边界较远，其预测值 $y=1$ 的置信度也就比较高。

预测点 $C$ 距离边界很近，决策边界的微小变化就可能会改变其预测值，因此置信度也就比较低。

我们希望找到最优的决策边界使得所有样本点的预测置信度尽可能的高。

为了更好的刻画这个问题，我们先来重新定义一下接下来的数学符号。

### *1.1 Notation*

对于输入特征 $x$，我们现在使用 $y\in\{-1,1\}$ 作为对应的输出，而不再是之前的 $y\in\{0,1\}$，而我们的分类器

$$h_{w, b}(x)=g\left(w^{T} x+b\right)$$

使用参数 $w,b$，其中 $w = [\theta_{1},\theta_{2}, \cdots, \theta_{n}]^{T}$，$b=\theta_{0}$，函数

$$g(z) = 
\begin{cases}
1  & \text{ if } z\geq 0 \\
-1  & \text{ otherwise } 
\end{cases}$$

### *1.2 Functional and Geometric Margins(函数间隔和几何间隔)*

对于一个样本 $(x^{(i)},y^{(i)})$，我们定义参数 $(w,b)$ 与这个样本的 *functional margins(函数间隔)* 为

$$\hat{\gamma}^{(i)}=y^{(i)}\left(w^{T} x^{(i)}+b\right)$$

这样定义的好处在于若 $\hat{\gamma}^{(i)}>0$ 说明预测是正确的，且 $\hat{\gamma}^{(i)}$ 的值越大说明预测的置信度越高。

对于训练集合 $S = \{(x^{(i)}, y^{(i)}) \mid i = 1,2\cdots n  \}$，我们定义参数 $(w,b)$ 与 $S$ 的函数间隔为

$$\hat{\gamma}=\min _{i=1, \ldots, n} \hat{\gamma}^{(i)}$$

也就是取所有样本中置信程度最低的那个，我们希望 $\hat{\gamma}$ 的值尽可能的大。

但是现在有一个问题，如果我们把 $w,b$ 都乘上一个 $2$，那么 $\hat{\gamma}^{(i)}$ 的值也就变成了原来的 $2$ 倍，也就是说 $\hat{\gamma}^{(i)}$ 是可以无限大的。

我们需要对 $w,b$ 做出限制，比如令

$$w := \frac{w}{||w||},\quad b:= \frac{b}{||w||}$$

现在我们再来定义 *Geometric Margins(几何间隔)*，如图所示

<center>
![title](/content-images/external/c7f63d5ba2c2121f71fff25411afe891.png)
</center>

中间的那条直线是我们的决策界线，它其实是一个超平面，而 $w$ 是它的法向量，点 $B$ 是 $A$ 在这个超平面上的投影。

我们定义参数 $(w,b)$ 与 样本点 $A$ 的几何间隔为 $A$ 到超平面的距离，也就是线段 $AB$ 的长度

$$\gamma^{(i)} = |AB|$$

如何求出这个长度呢？我们可以看到点 $B$ 可以表示为

$$\vec{B} = \vec{A} + \vec{AB} = x^{(i)}-\gamma^{(i)} \frac{w}{\|w\|}$$

而点 $B$ 在超平面上，需要满足超平面方程，也就是

$$w^{T}\left(x^{(i)}-\gamma^{(i)} \frac{w}{\|w\|}\right)+b=0$$

据此得到

$$\gamma^{(i)}=\frac{w^{T} x^{(i)}+b}{\|w\|}=\left(\frac{w}{\|w\|}\right)^{T} x^{(i)}+\frac{b}{\|w\|}$$

这是 $y=1$ 的样本的情况，为了兼容 $y=-1$ 的负样本，我们取

$$\gamma^{(i)}=y^{(i)}\left(\left(\frac{w}{\|w\|}\right)^{T} x^{(i)}+\frac{b}{\|w\|}\right)$$

可以看到几何间隔实际上就是函数间隔参数正则化的结果，我们取

$$\gamma=\min _{i=1, \ldots, n} \gamma^{(i)}$$

最大化 $\gamma$ 的值就是我们的目标。

## *2. The Optimal Margin Classifier(最优化间隔分类器)*

现在我们的需要解决如下的最优化问题

$$\begin{aligned}
\max_{\gamma, w, b} & \quad \gamma \\
\text { s.t. }& \quad y^{(i)}\left(w^{T} x^{(i)}+b\right) \geq \gamma, \quad i=1, \ldots, n \\
& \quad \|w\|=1
\end{aligned}$$

> **Definition 1.** 对于一个带约束的优化问题
> $$\begin{aligned}
\min_{w} &\quad f(w) \\
\text { s.t. }  &\quad g_{i}(w) \leq 0, \quad i=1, \ldots, k \\
& \quad h_{i}(w)=0, \quad i=1, \ldots, l
\end{aligned}$$ 若 $f$ 和 $g_{i}$ 均为凸函数，且 $h_{i}$ 均为形如 $$h_{i}(w) = a^{T}w + b$$ 的仿射函数，则该优化问题是 *convex optimization problem(凸优化问题)*

凸优化问题有许多很好的性质，有现成的软件可以解决它。

但是在我们的问题中，$\|w\| = 1$ 是一个非凸的约束，实际上我们的 $w$ 位于单位球面上，我们不能使用标准的凸优化方法解决它，考虑转化为一个更好的问题

$$\begin{aligned}
\max _{\hat{\gamma}, w, b} & \quad \frac{\hat{\gamma}}{\|w\|} \\
\text { s.t. } & \quad y^{(i)}\left(w^{T} x^{(i)}+b\right) \geq \hat{\gamma}, \quad i=1, \ldots, n
\end{aligned}$$

现在所有的约束都是凸函数了，但是我们的目标函数变成了非凸的，我们不能保证像梯度下降之类的算法能够找到全局最优解。

考虑继续转化问题，在之前的讨论中，我们发现参数 $w,b$ 的放缩并不影响结果，因为放缩并没有改变超平面的位置，只是改变了法向量的取值。

因此我们可以通过放缩 $w,b$ 的值使得 $\hat{\gamma} = 1$，那么问题就变成了

$$\begin{aligned}
\min _{w, b} &\quad \frac{1}{2}\|w\|^{2} \\
\text { s.t. } &\quad y^{(i)}\left(w^{T} x^{(i)}+b\right) \geq 1, \quad i=1, \ldots, n
\end{aligned}$$

这是一个凸优化问题，我们可以直接用软件来解决它。问题到这里似乎已经结束了，然而这个优化问题有一些非常漂亮的性质，这些性质可以让我们的软件更高效的求解，而且可以把问题扩展到更高维，乃至无限维的空间内。

在此之前，我们先来讨论一下拉格朗日乘数法。

## *3. Generalized Lagrange's method(广义拉格朗日方法)*

> **Theorem 1. Lagrange multiplier(拉格朗日乘子法).** 对于如下的最优化问题
> $$\begin{aligned}
\min_{w} & \quad f(w) \\
\text{s.t.} & \quad h_{i}(w) = 0, \quad i = 1,2,\cdots,l
\end{aligned}$$ 定义 *Lagrangian(拉格朗日算子)*
> $$\mathcal{L}(w, \beta)=f(w)+\sum_{i=1}^{l} \beta_{i} h_{i}(w)$$ 其中 $\beta_{i}$ 称为 *Lagrange multipliers(拉格朗日乘子)*，则问题的最优解 $w$ 满足
> $$\frac{\partial \mathcal{L}}{\partial w_{i}}=0, \quad \frac{\partial \mathcal{L}}{\partial \beta_{i}}=0$$

接下来我们将扩展拉格朗日乘子法，来解决如下的问题

$$\begin{aligned}
\min _{w} &\quad  f(w) \\
\text { s.t. } & \quad g_{i}(w) \leq 0, \quad i=1, \ldots, k \\
& \quad h_{i}(w)=0, \quad i=1, \ldots, l
\end{aligned}$$

我们把这个问题称为 *primal optimization problem(原始优化问题)*，为了解决它，我们定义 *generalized Lagrangian(广义拉格朗日算子)*

$$\mathcal{L}(w, \alpha, \beta)=f(w)+\sum_{i=1}^{k} \alpha_{i} g_{i}(w)+\sum_{i=1}^{l} \beta_{i} h_{i}(w)$$

其中 $\alpha_{i}, \beta_{i}$ 是拉格朗日乘子，定义

$$\theta_{\mathcal{P}}(w)=\max _{\alpha, \beta: \alpha_{i} \geq 0} \mathcal{L}(w, \alpha, \beta)$$

我们发现如果 $w$ 违反了任何一条约束，都会有 $\theta_{\mathcal{P}}(w) \rightarrow \infty$，如果 $w$ 满足所有约束，则有 $\theta_{\mathcal{P}}(w)=f(w)$，因此

$$\theta_{\mathcal{P}}(w)= \begin{cases}f(w) & \text { if } w \text { satisfies primal constraints } \\ \infty & \text { otherwise. }\end{cases}$$

现在我们的问题就等价于求

$$p^{*} =  \min _{w} \theta_{\mathcal{P}}(w)=\min _{w} \max _{\alpha, \beta: \alpha_{i} \geq 0} \mathcal{L}(w, \alpha, \beta)$$

现在我们来看另外一个稍微有些不同的问题，定义

$$\theta_{\mathcal{D}}(\alpha, \beta)=\min _{w} \mathcal{L}(w, \alpha, \beta)$$

我们的 *dual optimization problem(对偶优化问题)* 就是求

$$d^{*} = \max _{\alpha, \beta: \alpha_{i} \geq 0} \theta_{\mathcal{D}}(\alpha, \beta)=\max _{\alpha, \beta: \alpha_{i} \geq 0} \min _{w} \mathcal{L}(w, \alpha, \beta)$$

> **Theorem 2. Max-Min Inequality.** 对于任意函数 $f(x,y)$ 有
> $$\max_{x}\min_{y}f(x,y) \leq \min_{y} \max_{x} f(x,y)$$

我们设 $g(x) = \min_{y} f(x,y)$，如何理解对二元函数 $f(x,y)$ 取 $\min$ 的操作呢？ $\min_{y}f(x,y)$ 是一个关于 $x$ 的函数，那么对于任意的 $x = a$ 都有

$$g(a) = \min_{y} f(a,y)$$

因此 $\forall x,y$ 都有 $g(x) \leq f(x,y)$，自然 $\forall y$ 有

$$\max_{x} g(x) \leq \max_{x} f(x,y)$$

因此

$$\max_{x} g(x) \leq \min_{y} \max_{x} f(x,y)$$

我们成功证明了 *max-min inequality*，应用到上面的原始对偶问题就有

$$d^{*}=\max _{\alpha, \beta: \alpha_{i} \geq 0} \min _{w} \mathcal{L}(w, \alpha, \beta) \leq \min _{w} \max _{\alpha, \beta: \alpha_{i} \geq 0} \mathcal{L}(w, \alpha, \beta)=p^{*}$$

也就是说对偶问题的解是原始问题解的一个下界，这就是 *weak duality(弱对偶)*，并且在特定的条件下，是可以取等号的，也就是 *strong duality(强对偶)*.

> **Theorem 3. Karush-Kuhn-Tucker conditions(KKT条件).** 若凸优化问题
> $$\begin{aligned}
\min_{w} &\quad f(w) \\
\text { s.t. }  &\quad g_{i}(w) \leq 0, \quad i=1, \ldots, k \\
& \quad h_{i}(w)=0, \quad i=1, \ldots, l
\end{aligned}$$ 满足 *Slater conditions*(Slater条件)，即存在 $w$ 使得所有的 $g_{i}(w) < 0$ 成立，则必然存在 $w^{*}, \alpha^{*}, \beta^{*}$ 使得 $$p^{*} = d^{*} = \mathcal{L}\left(w^{*}, \alpha^{*}, \beta^{*}\right)$$ 且 $w^{*}, \alpha^{*}, \beta^{*}$ 满足如下的 *KKT* 条件
> $$\begin{aligned}
\frac{\partial}{\partial w_{i}} \mathcal{L}\left(w^{*}, \alpha^{*}, \beta^{*}\right) &=0, \quad i=1, \ldots, d \\
\frac{\partial}{\partial \beta_{i}} \mathcal{L}\left(w^{*}, \alpha^{*}, \beta^{*}\right) &=0, \quad i=1, \ldots, l \\
\alpha_{i}^{*} g_{i}\left(w^{*}\right) &=0, \quad i=1, \ldots, k \\
g_{i}\left(w^{*}\right) & \leq 0, \quad i=1, \ldots, k \\
\alpha^{*} & \geq 0, \quad i=1, \ldots, k
\end{aligned}$$
> 另一方面，若存在 $w^{*},\alpha^{*},\beta^{*}$ 满足 *KKT* 条件，那么 $w^{*}$ 是原始问题的解，且 $\alpha^{*},\beta^{*}$ 是对偶问题的解。

我们重点关注一下这个条件

$$\alpha_{i}^{*} g_{i}\left(w^{*}\right)=0$$

它被称为 *dual complementarity condition(对偶互补条件)*，它暗示了

$$\alpha_{i}^{*} > 0 \Rightarrow g_{i}(w^{*}) =0$$

这是显然成立的，另一方面，我们知道 $\alpha,g$ 是可以同时为 $0$ 的，也就是说 $\Leftarrow$ 不一定成立，但是在实际应用中，我们发现大部分的情况都是成立的，即

$$\alpha_{i}^{*} > 0 \Leftrightarrow g_{i}(w^{*}) =0$$

## *4. Optimal margin classifiers(最优化间隔分类器)*

现在回到我们的问题

$$\begin{aligned}
\min _{w, b} &\quad \frac{1}{2}\|w\|^{2} \\
\text { s.t. } &\quad y^{(i)}\left(w^{T} x^{(i)}+b\right) \geq 1, \quad i=1, \ldots, n
\end{aligned}$$

可以把约束条件写成

$$g_{i}(w)=-y^{(i)}\left(w^{T} x^{(i)}+b\right)+1 \leq 0$$

这显然是个凸优化问题，我们假设它满足 *Slater* 条件，即存在 $w,b$ 使得

$$g_{i}(w) < 0$$

成立，也就是说存在一个超平面可以把两类样本点分隔开。接下来写出我们的拉格朗日算子

$$\mathcal{L}(w, b, \alpha)=\frac{1}{2}\|w\|^{2}-\sum_{i=1}^{n} \alpha_{i}\left[y^{(i)}\left(w^{T} x^{(i)}+b\right)-1\right]$$

我们的目标是求出

$$p^{*} = \min_{w,b} \max_{\alpha:\alpha_{i}\geq 0} \mathcal{L}(w,b,\alpha)$$

在我们的假设下，我们的问题是满足 *KKT* 条件的，因此可以先求解对偶问题

$$\theta_{D}(\alpha) = \min_{w,b} \mathcal{L} (w,b,\alpha)$$

我们来看看这个对偶问题长什么样子，要对参数 $w,b$ 最小化，即

$$\frac{\partial}{\partial w} \mathcal{L}(w, b, \alpha)=w-\sum_{i=1}^{n} \alpha_{i} y^{(i)} x^{(i)}=0$$

$$\frac{\partial}{\partial b} \mathcal{L}(w, b, \alpha)=\sum_{i=1}^{n} \alpha_{i} y^{(i)}=0$$

得到 $w = \sum_{i=1}^{n} \alpha_{i} y^{(i)} x^{(i)}$，代入回去得到

$$\begin{aligned}\mathcal{L}(w, b, \alpha)
&= \sum_{i=1}^{n} \alpha_{i}-\frac{1}{2} \sum_{i, j=1}^{n} y^{(i)} y^{(j)} \alpha_{i} \alpha_{j}\left(x^{(i)}\right)^{T} x^{(j)}-b \sum_{i=1}^{n} \alpha_{i} y^{(i)} \\
&= \sum_{i=1}^{n} \alpha_{i}-\frac{1}{2} \sum_{i, j=1}^{n} y^{(i)} y^{(j)} \alpha_{i} \alpha_{j} \langle x^{(i)},x^{(j)} \rangle 
\end{aligned}$$

现在我们可以写出对偶问题

$$\begin{aligned}
\max _{\alpha} & \quad W(\alpha)=\sum_{i=1}^{n} \alpha_{i}-\frac{1}{2} \sum_{i, j=1}^{n} y^{(i)} y^{(j)} \alpha_{i} \alpha_{j}\left\langle x^{(i)}, x^{(j)}\right\rangle \\
\text { s.t. } & \quad \alpha_{i} \geq 0, \quad i=1, \ldots, n \\
& \quad \sum_{i=1}^{n} \alpha_{i} y^{(i)}=0
\end{aligned}$$

现在我们的问题转化为了找到参数 $\alpha$ 使得 $W(\alpha)$ 最大，且满足约束条件。当我们求出这个 $\alpha^{*}$ 时，相应的 $w^{*},b^{*}$ 也就有了

$$w^{*}=\sum_{i=1}^{n} \alpha_{i} y^{(i)} x^{(i)}$$

$$b^{*}=-\frac{\max_{i: y^{(i)}=-1} w^{* T} x^{(i)}+\min _{i: y^{(i)}=1} w^{* T} x^{(i)}}{2}$$

这个 $b^{*}$ 是怎么得到的呢？如图所示：

<center>
![title](/content-images/external/b6cb8887c94919e911094b5bcb34ba41.png)
</center>

在确定 $w$ 后，超平面的方向也就确定了，那么超平面最佳截距一定满足正负样本到超平面的最小距离是一样的，设最差的正负样本对应的超平面（即图中的两条虚线）方程为

$$w^{* T} x_{0} + b_{0} = 0$$

$$w^{* T} x_{1} + b_{1} = 0$$

那么就有

$$b^{*} = \frac{b_{0} + b_{1}}{2} = -\frac{\max_{i: y^{(i)}=-1} w^{* T} x^{(i)}+\min _{i: y^{(i)}=1} w^{* T} x^{(i)}}{2}$$

看到这里，诸位一定很疑惑为什么一定要绕这么一大圈将原始问题转化为对偶问题去解决呢？既然原始问题已经是凸优化问题了，直接交给软件去跑不就行了？

实际上直接跑原始问题是完全可行的，但是求解对偶问题 $W(\alpha)$ 有一个非常高效的算法，在后面会展开细说，而且在推导对偶问题的过程中，我们可以发现一些非常有趣的东西。

根据 *KKT* 条件，要使得我们求出的参数 $w^{*}, b^{*}$ 是原始问题的解，必须要满足

$$\alpha_{i}^{*} g_{i}(w^{*}) = 0$$
 
- 当 $g_{i}(w^{*}) = 0$ 时，对应的样本点的函数间隔为 $1$，也就是距离超平面最近的那些点，这些点的数量是很少的。
- 当 $\alpha_{i}^{*} = 0$ 时，对应的是其他的样本点，这些点的数量是很多的。

也就是说，大部分的样本点对应的 $\alpha_{i}^{*}=0$，而 $\alpha_{i}^{*}\neq 0$ 的样本点 $x^{(i)}$ 是很少的，它们是距离超平面最近的点，我们把这些点称为 *support vector(支持向量)*.

现在我们可以写出最终的预测函数

$$h_{w,b}(x) = g(w^{T}x+b) = g(\sum_{i=1}^{n}\alpha_{i}y^{(i)} \langle x^{(i)}, x \rangle +b)$$

那么在进行预测时，只需要考虑支持向量 $x^{(i)}$，其它样本点对应的 $\alpha$ 都是 $0$.
