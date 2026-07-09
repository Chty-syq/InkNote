---
type: markdown
title: The KL-Divergence
slug: "3083238"
date: 2023-06-13
updatedAt: 2026-06-29 17:18:20
tags:
  - 概率论
  - 基础数学
published: true
category: mathmatics
---

## *1. The Information Entropy(信息熵)*

我们来看一个例子，设随即变量 $X$ 表示投掷一枚质地均匀的骰子时得到的结果，显然

$$P(X = x) = \frac{1}{6}, \quad x \in \{1,2,3,4,5,6\}$$

而随机变量 $Y$ 表示投掷骰子的结果的奇偶性，则

$$P(Y=0) = P(Y=1) = \frac{1}{2}$$

那么当我们真正就行掷骰子的实验时，假设我们得到了 $X = 1$，那么我们就得到了 $6$ 个信息

- 本次实验的结果为 $1$
- 本次实验的结果不为 $2, 3, 4,5, 6$ （五个信息）

而假设我们得到了结果 $Y=1$，那么我们得到的是 $2$ 个信息

- 本次实验的结果为偶数
- 本次实验的结果不为奇数

从这个例子中，我们可以看到在进行试验时，不同事件所包含的信息量是不同的

- 概率越高的事件，包含的信息量越小
- 概率越低的事件，包含的信息量越大

另一方面，对于两个独立的事件，它们所包含的信息量应该是可加的，例如掷骰子和掷硬币同时进行时，得到的总信息量应该是两次独立试验所得的信息量的和。

> **Definition 1.** 设随机变量 $X$ 有概率分布 $p(x)$，我们定义信息量函数
> $$h(x) = -\log{p(x)}$$ 描述事件 $X$ 取值为 $x$ 发生时的信息量，定义 $X$ 的 *information entropy(信息熵)*
> $$H(X) = \mathbb E[h(x)]$$

这里，信息量函数 $h(x)$ 对于两独立随机变量 $X,Y$ 是可加的

$$\begin{aligned}
h(x, y) & =-\log p(x, y) \\
& =-\log \{p(x) p(y)\} \\
& =-\log p(x)-\log p(y) \\
& =h(x)+h(y)
\end{aligned}$$

而信息熵 $H(X)$ 则是计算了在 $p$ 分布下各取值所含信息量的均值，它描述了随机变量 $X$ 的不确定性。

---

## *2. The Cross Entropy(交叉熵)*

> **Definition 2.** 设随机变量 $P,Q$ 分别有概率分布 $p(x),q(x)$，我们定义它们的 *cross entropy(交叉熵)* 为
> $$H(P, Q)=-\mathbb{E}_{x \sim p(x)} [\log q(x)]=-\sum_{x} p\left(x\right) \log q\left(x\right)$$

从定义可以看到当 $P=Q$ 时，有 $H(P,Q) = H(P)$，现在我们取一个微小的扰动 $\epsilon>0$，令分布 $Q^{\prime}$ 为

$$q(x) = \left\{\begin{matrix}
p(x) + \epsilon, & x=x_{1} \\ 
p(x) - \epsilon, & x=x_{2} \\
p(x) , & \text{others}
\end{matrix}\right.$$

此时

$$H(P,Q) = -\sum_{x\neq x_{1},x_{2}} p(x) \log q(x) - p(x_{1}) \log \left\{q(x_{1}) + \epsilon\right\} - p(x_{2}) \log \left\{q(x_{2}) - \epsilon \right\}$$

我们对 $\epsilon$ 求导得到

$$\nabla_{\epsilon} H(P,Q) = \frac{(p(x_{1}) + p(x_{2}))\epsilon}{(p(x_{1}) + \epsilon)(p(x_{2})-\epsilon)} > 0$$

因此随着扰动 $\epsilon$ 的增大，交叉熵 $H(P,Q)$ 的值增大，也就是说交叉熵衡量了分布 $Q$ 偏离分布 $P$ 的程度。

在深度学习算法中，常常使用交叉熵衡量真实标签的分布 $P$ 与预测值的分布 $Q$ 之间的差异，作为 *loss function* 进行参数的迭代优化。

---

## *3. The KL-Divergence(KL散度)*

> **Definition 3.** 设随机变量 $P,Q$ 分别有概率分布 $p(x),q(x)$，我们定义它们的 *KL-divergence(KL散度)* 为
> $$\begin{aligned}
D_{\mathrm{KL}}[P \| Q] & =\sum_{x} p(x) \log \frac{p(x)}{q(x)} \\
& =\mathbb{E}_{x\sim p(x)}\left[\log \frac{p(x)}{q(x)}\right] \\
& =\mathbb{E}_{x\sim p(x)}[\log p(x)-\log q(x)] \\
& =\mathbb{E}_{x\sim p(x)}[-\log q(x)]-\mathbb{E}_{x\sim p(x)}[-\log p(x)] \\
& =H(P,Q)-H(P)
\end{aligned}$$

注意到当 $P=Q$ 时，$D_{\mathrm{KL}}[P \| P]=0$，观察这个式子的形式，我们发现 *KL* 散度是一种相对熵，它衡量了分布 $P,Q$ 之间的距离，而这个距离是非对称的。

根据琴生不等式，有

$$\begin{aligned} D_{\mathrm{KL}}[P \| Q]
&= -\mathbb{E}_{x \sim p(x)}\left[\log \frac{q(x)}{p(x)}\right] \\
&\geq - \log \mathbb{E}_{x \sim p(x)}\left[\frac{q(x)}{p(x)}\right] = - \log \sum_{x} q(x) = 0
\end{aligned}$$

即 *KL* 散度具有非负性，交叉熵的值一定不小于信息熵，这与我们的直觉是一致的。

当我们用参数 $\theta$ 对未知分布 $p(x)$ 建模时，极小化 *KL* 散度通常等价于极大化 $\theta$ 的似然函数。

在深度学习算法中，标签的真实分布 $P$ 通常是已知的，此时极小化 *KL* 散度等价于极小化交叉熵。

---

## *Reference*

- https://gregorygundersen.com/blog/2019/01/22/kld/
- https://en.wikipedia.org/wiki/Kullback%E2%80%93Leibler_divergence
- https://www.cnblogs.com/wuliytTaotao/p/9713038.html
- https://zhuanlan.zhihu.com/p/39682125
