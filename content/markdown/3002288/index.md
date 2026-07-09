---
type: markdown
title: Hoeffding's Inequality
slug: "3002288"
date: 2023-03-30
updatedAt: 2026-06-29 17:18:23
tags:
  - 基础数学
  - 概率论
published: true
category: mathmatics
---

## *1. Basic Probability Bounds(基础概率界)*

在概率统计学与机器学习中，有一个非常基本的问题，即对于给定的随机变量 $Z$，如何衡量 $Z$ 与其期望 $\mathbb{E}[Z]$ 的相近程度，即 $Z - \mathbb{E}[Z]$ 的概率分布。

> **Lemma 1. Markov's Inequality(马尔科夫不等式).** 设随机变量 $Z \geq 0$，则对于任意的 $t\geq 0$ 有
> $$\mathbb{P}(Z \geq t) \leq \frac{\mathbb{E}[Z]}{t}$$

证明：注意到 $\mathbb{P}(Z \geq t)=\mathbb{E}[1\{Z \geq t\}]$，当 $Z \geq t$ 时，有

$$\frac{Z}{t} \geq 1 \geq 1\{Z \geq t\}$$

当 $Z < t$ 时，有

$$\frac{Z}{t} \geq 0=1\{Z \geq t\}$$

因此 

$$\mathbb{P}(Z \geq t)=\mathbb{E}[1\{Z \geq t\}] \leq \mathbb{E}\left[\frac{Z}{t}\right]=\frac{\mathbb{E}[Z]}{t}$$

> **Lemma 2. Chebyshev's inequality(切比雪夫不等式).** 设随机变量 $Z$ 满足 $\operatorname{Var}(Z)<\infty$，则对于任意的 $t\geq 0$ 有
> $$\mathbb{P}(|Z - \mathbb{E}[Z]| \geq t) \leq \frac{\operatorname{Var}(Z)}{t^2}$$

证明：注意到

$$|Z- \mathbb{E}[Z]| \geq t \Rightarrow (Z-\mathbb{E}[Z])^2 \geq t^2$$

应用 *Markov's inequality* 即可证明

$$\begin{aligned}
\mathbb{P}(|Z - \mathbb{E}[Z]| \geq t) & =\mathbb{P}\left((Z-\mathbb{E}[Z])^2 \geq t^2\right) \\
& \leq \frac{\mathbb{E}\left[(Z-\mathbb{E}[Z])^2\right]}{t^2}=\frac{\operatorname{Var}(Z)}{t^2}
\end{aligned}$$

切比雪夫不等式告诉我们，随机变量 $Z$ 与其期望 $\mathbb{E}[Z]$ 的距离受到其方差的制约，这与方差的定义是一致的。

> **Example 1.**  设 $Z_{1},\ldots,Z_{n}$ 为独立同分布的随机变量且 $\mathbb{E}\left[Z_i\right]=0$，设 
> $$\bar{Z}=\frac{1}{n} \sum_{i=1}^n Z_i$$ 则 $\mathbb{E}[\bar{Z}] = 0$，且
> $$\operatorname{Var}(\bar{Z})=\mathbb{E}\left[\left(\frac{1}{n} \sum_{i=1}^n Z_i\right)^2\right]=\frac{1}{n^2} \sum_{i=1}^n \mathbb{E}\left[Z_i^2\right]=\frac{\operatorname{Var}\left(Z_1\right)}{n}$$ 应用切比雪夫不等式，对于任意的 $t\geq 0$ 有
> $$\mathbb{P}\left(\bar{Z} \geq t\right) \leq \frac{\operatorname{Var}\left(Z_1\right)}{n t^2}$$

---

## *2. Moment Generating Functions(矩生成函数)*

> **Definition 1.** 设 $Z$ 为任意随机变量，定义其 *moment generating functions(矩生成函数)* 为
> $$M_Z(\lambda)=\mathbb{E}[\exp (\lambda Z)]$$ 其中 $\lambda$ 为该生成函数的形式幂级数。

<div></div>

> **Lemma 3. Chernoff Bounds(切尔诺夫界).** 设 $Z$ 为任意随机变量，则对于任意的 $t\geq 0$ 有
> $$\mathbb{P}(Z \geq \mathbb{E}[Z]+t) \leq \min _{\lambda \geq 0} \mathbb{E}\left[e^{\lambda(Z-\mathbb{E}[Z])}\right] e^{-\lambda t}=\min _{\lambda \geq 0} M_{Z-\mathbb{E}[Z]}(\lambda) e^{-\lambda t}$$ $$\mathbb{P}(Z \leq \mathbb{E}[Z]-t) \leq \min _{\lambda \geq 0} \mathbb{E}\left[e^{\lambda(\mathbb{E}[Z]-Z)}\right] e^{-\lambda t}=\min _{\lambda \geq 0} M_{\mathbb{E}[Z]-Z}(\lambda) e^{-\lambda t}$$

我们仅证明第一个不等式，另一半的证法是相同的。对于任意 $\lambda > 0$，我们有

$$Z \geq \mathbb{E}[Z]+t \Leftrightarrow e^{\lambda(Z-\mathbb{E}[Z])} \geq e^{\lambda t}$$

因此，应用马尔科夫不等式可以得到

$$\mathbb{P}(Z-\mathbb{E}[Z] \geq t)=\mathbb{P}\left(e^{\lambda(Z-\mathbb{E}[Z])} \geq e^{\lambda t}\right) \leq \mathbb{E}\left[e^{\lambda(Z-\mathbb{E}[Z])}\right] e^{-\lambda t}$$

对于 $\lambda = 0$，显然不等式也是成立的，证毕。

使用矩生成函数的好处在于，它能够很好地处理随机变量的和，设 $Z_{1},\ldots,Z_{n}$ 为独立的随机变量，则

$$M_{Z_1+\cdots+Z_n}(\lambda)=\prod_{i=1}^n M_{Z_i}(\lambda)$$

这是因为

$$\mathbb{E}\left[\exp \left(\lambda \sum_{i=1}^n Z_i\right)\right]=\mathbb{E}\left[\prod_{i=1}^n \exp \left(\lambda Z_i\right)\right]=\prod_{i=1}^n \mathbb{E}\left[\exp \left(\lambda Z_i\right)\right]$$

这意味着，当我们计算一些独立同分布的随机变量之和的切尔诺夫界时，只需要计算其中某个随机变量的矩生成函数，例如假设 $Z_{i}$ 是独立同分布的且期望为 $0$，则

$$\begin{aligned}
\mathbb{P}\left(\sum_{i=1}^n Z_i \geq t\right) & \leq \frac{\prod_{i=1}^n \mathbb{E}\left[\exp \left(\lambda Z_i\right)\right]}{e^{\lambda t}} \\
& =\left(\mathbb{E}\left[e^{\lambda Z_1}\right]\right)^n e^{-\lambda t}
\end{aligned}$$

---

## *3. Moment Generating Function Examples(矩生成函数的例子)*

这一节我们介绍矩生成函数的一些例子，并得到一些非常优雅的不等式。这些不等式都拥有这样的形式

$$M_Z(\lambda)=\mathbb{E}\left[e^{\lambda Z}\right] \leq \exp \left(\frac{C^2 \lambda^2}{2}\right) \text { for all } \lambda \in \mathbb{R}$$

其中，$C \in \mathbb{R}$ 的值取决于随机变量 $Z$ 的分布，这种形式的不等式在应用切尔诺夫界时非常有用。

> **Example 2.** 若随机变量 $Z$ 服从高斯分布 $Z \sim \mathcal{N}\left(0, \sigma^2\right)$ 时，则
> $$\mathbb{E}[\exp (\lambda Z)]=\exp \left(\frac{\lambda^2 \sigma^2}{2}\right)$$

证明：首先我们写出 $Z$ 的概率密度函数

$$f(z) =\frac{1}{\sqrt{2 \pi} \sigma} \exp({-\frac{z^2}{2 \sigma^2}})$$

然后写出期望表达式

$$\begin{aligned}\mathbb{E}[\exp (\lambda Z)]
&=\int_{-\infty}^{\infty} \exp (\lambda z) f(z) dz = \int_{-\infty}^{\infty} \frac{1}{\sqrt{2 \pi} \sigma} \exp({\lambda z-\frac{z^2}{2 \sigma^2}}) dz\\
&=\int_{-\infty}^{\infty} \frac{1}{\sqrt{2 \pi} \sigma} \exp({\lambda z-\frac{z^2}{2 \sigma^2}}) dz \\
&=\int_{-\infty}^{\infty} \frac{1}{\sqrt{2 \pi} \sigma} \exp({-\frac{{(z-\lambda\sigma^{2}})^2}{2 \sigma^2}})\exp(\frac{\lambda^{2}\sigma^{2}}{2}) dz \\
&= \exp(\frac{\lambda^{2}\sigma^{2}}{2})\int_{-\infty}^{\infty} \frac{1}{\sqrt{2 \pi} \sigma} \exp({-\frac{z^2}{2 \sigma^2}}) dz \\
&= \exp(\frac{\lambda^{2}\sigma^{2}}{2})
\end{aligned}$$

> **Example 3.** 若随机变量 $Z$ 服从概率分布 $\mathbb{P}(Z=1) = \mathbb{P}(Z=-1) = \frac{1}{2}$，则
> $$\mathbb{E}[\exp (\lambda Z)]\leq\exp \left(\frac{\lambda^2}{2}\right)$$

证明：我们将期望的表达式泰勒展开得到

$$\mathbb{E}\left[\exp({\lambda Z})\right]=\sum_{k=0}^{\infty} \frac{\lambda^k \mathbb{E}\left[Z^k\right]}{k !}=\sum_{k=0}^{\infty} \frac{\lambda^{2 k}}{(2 k) !}$$

这是因为

$$\mathbb{E}\left[Z^k\right]=\left\{\begin{matrix}
0, & k \text{是奇数}\\ 
1, & k \text{是偶数}
\end{matrix}\right.$$

注意到 $(2 k) ! \geq 2^k \cdot k !$ 恒成立，因此

$$\mathbb{E}\left[\exp({\lambda Z})\right] \leq \sum_{k=0}^{\infty} \frac{\left(\lambda^2\right)^k}{2^k \cdot k !}=\sum_{k=0}^{\infty}\left(\frac{\lambda^2}{2}\right)^k \frac{1}{k !}=\exp \left(\frac{\lambda^2}{2}\right)$$

> **Example 4.** 若随机变量 $S = \sum_{i=1}^{n}Z_{i}$，其中 $Z_{i}$ 相互独立且服从概率分布 
> $$\mathbb{P}(Z_{i}=1) = \mathbb{P}(Z_{i}=-1) = \frac{1}{2}$$ 显然有 $\mathbb{E}(S)=0$，根据切尔诺夫界，有
> $$\mathbb{P}(S \geq t) \leq \mathbb{E}\left[e^{\lambda Z_1}\right]^n e^{-\lambda t} \leq \exp \left(\frac{n \lambda^2}{2}-\lambda t\right)$$ 我们在 $\lambda \geq 0$ 的条件下求右边的最小值得到
> $$\mathbb{P}(S \geq t) \leq \exp \left(-\frac{t^2}{2 n}\right)$$

---

## *4. Hoeffding’s Lemma(霍夫丁引理)*

在证明霍夫丁引理的过程中，我们需要用到琴生不等式，我们先把它写在这里。

> **Lemma 4. Jensen's Inequality(琴生不等式).** 若函数 $f(x)$ 在区间  $[x_{1},x_{2}]$ 上为 *convex function(凸函数)*，则对于区间内的一点
> $$x = \alpha x_{1} + (1-\alpha) x_{2}, \quad \alpha \in [0,1]$$ 有如下的不等式恒成立
> $$f\left(x\right) \leq \alpha f\left(x_1\right)+(1-\alpha) f\left(x_2\right) .$$

这个不等式相信各位读者高中时便已铭记于心，如果将函数图像画出来，不等式的正确性是显然的，这里就不赘述证明过程了。

<div></div>

> **Lemma 5. Hoeffding’s Lemma(霍夫丁引理).** 设有界随机变量 $Z \in [a,b]$，则
> $$\mathbb{E}[\exp (\lambda(Z-\mathbb{E}[Z]))] \leq \exp \left(\frac{\lambda^2(b-a)^2}{8}\right), \quad\text { for all } \lambda \in \mathbb{R}$$

不失一般性的，我们可以通过将 $Z - \mathbb{E}[Z]$ 替换为 $Z$ 的方式来假设 $\mathbb{E}[Z] = 0$，且 $a \leq 0 \leq b$，我们只需要证明

$$\mathbb{E}[\exp (\lambda Z)] \leq \exp \left(\frac{\lambda^2(b-a)^2}{8}\right)$$

注意到 $f(z) = \exp(\lambda z)$ 在区间 $[a,b]$ 上为凸函数，因此

$$\exp(\lambda z) \leq \alpha \exp(\lambda a) + (1-\alpha) \exp(\lambda b)$$

其中 $\alpha = \frac{b-z}{b-a}$，因此

$$\begin{aligned}\mathbb{E}[\exp (\lambda Z)] 
&\leq \mathbb{E}\left[\frac{b-Z}{b-a}\exp(\lambda a) + \frac{Z-a}{b-a}\exp(\lambda b)\right] \\
&=\frac{b}{b-a}\exp(\lambda a) - \frac{a}{b-a}\exp(\lambda b) 
\end{aligned}$$

两边取对数得到

$$\log \mathbb{E}[\exp (\lambda Z)] = \lambda a + \log \left( \frac{b}{b-a} - \frac{a}{b-a}\exp(\lambda(b-a)) \right) $$

令 $\gamma = -\frac{a}{b-a}, u = \lambda (b-a)$，则上式可以写为

$$g(u) = -\gamma u+\log(1-\gamma + \gamma e^{u})$$

考虑其泰勒展开式，先求其导数得到

$$g^{\prime}(u) = \frac{\gamma e^{u}}{1-\gamma+\gamma e^{u}} - \gamma$$

$$g^{\prime\prime}(u) = \frac{(1-\gamma)\gamma  e^{u}}{(1-\gamma+\gamma e^{u})^{2}}$$

注意到 $g(0)=0, g^{\prime}(0)=0$，根据 *AMGM(算数-几何均值不等式)* 可以得到 $g^{\prime\prime}(u)\leq \frac{1}{4}$，因此

$$g(u) = g(0) + ug^{\prime}(0) + \frac{u^{2}}{2} g^{\prime\prime}(\epsilon) \leq \frac{u^{2}}{8}$$

代回去得到

$$\mathbb{E}[\exp (\lambda Z)] = e^{g(u)} \leq \exp\left(\frac{\lambda^{2}(b-a)^{2}}{8}\right)$$

---

## *5. Hoeffding’s Inequality(霍夫丁不等式)*

> **Theorem 1. Hoeffding’s Inequality(霍夫丁不等式).** 设随机变量 $Z_{1},\ldots,Z_{n}$ 有界且相互独立，且所有的 $Z_{i}$ 满足 $Z_{i} \in [a,b]$，则对于任意的 $t \geq 0$，有
> $$\mathbb{P}\left(\frac{1}{n} \sum_{i=1}^n\left(Z_i-\mathbb{E}\left[Z_i\right]\right) \geq t\right) \leq \exp \left(-\frac{2 n t^2}{(b-a)^2}\right)$$ $$\mathbb{P}\left(\frac{1}{n} \sum_{i=1}^n\left(Z_i-\mathbb{E}\left[Z_i\right]\right) \leq-t\right) \leq \exp \left(-\frac{2 n t^2}{(b-a)^2}\right)$$

现在终于回到了我们的正题，来证明霍夫丁不等式，首先根据切尔诺夫界有

$$\begin{aligned}
\mathbb{P}\left(\frac{1}{n} \sum_{i=1}^n\left(Z_i-\mathbb{E}\left[Z_i\right]\right) \geq t\right) & =\mathbb{P}\left(\sum_{i=1}^n\left(Z_i-\mathbb{E}\left[Z_i\right]\right) \geq n t\right) \\
& \leq \mathbb{E}\left[\exp \left(\lambda \sum_{i=1}^n\left(Z_i-\mathbb{E}\left[Z_i\right]\right)\right)\right] e^{-\lambda n t} \\
& =\left(\prod_{i=1}^n \mathbb{E}\left[e^{\lambda\left(Z_i-\mathbb{E}\left[Z_i\right]\right)}\right]\right) e^{-\lambda n t}
\end{aligned}$$

根据霍夫丁引理，得到

$$LHS \leq \left(\prod_{i=1}^n e^{\frac{\lambda^2(b-a)^2}{8}}\right) e^{-\lambda n t} = \exp \left(\frac{n \lambda^2(b-a)^2}{8}-\lambda n t\right)$$

在 $\lambda \geq 0$ 下求其最小值得到最小值点 $\lambda = \frac{4nt}{n(b-a)^{2}}$，以及

$$LHS \leq \exp \left(-\frac{2 n t^2}{(b-a)^2}\right)$$

这就是我们想要的结果，另一半的证明也是类似的。

---

## *6. Reference*

- [http://cs229.stanford.edu/extra-notes/hoeffding.pdf](http://cs229.stanford.edu/extra-notes/hoeffding.pdf)
- [https://stats.stackexchange.com/questions/21075/understanding-proof-of-a-lemma-used-in-hoeffding-inequality](https://stats.stackexchange.com/questions/21075/understanding-proof-of-a-lemma-used-in-hoeffding-inequality)
- [https://en.wikipedia.org/wiki/Jensen%27s_inequality](https://en.wikipedia.org/wiki/Jensen%27s_inequality)
