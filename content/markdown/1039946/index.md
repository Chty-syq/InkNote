---
type: markdown
title: Variational Inference
slug: "1039946"
order: 24
date: 2023-06-14
updatedAt: 2026-07-10 21:11:10
tags:
  - 机器学习
published: true
category: machine-learning
---

## *1. The Expectation Maximization Review(EM算法回顾)*

> **Method 1. Expectation Maximization(期望最大化算法).** 在数据集 $\left\{x^{(1)}, \ldots, x^{(n)}\right\}$ 上有概率分布 $P(x,z; \theta)$，其中 $z$ 是不可观测的随机变量，我们用 *EM* 算法来估计参数 $\theta$ 的流程如下：
> 
> 1. 初始化参数 $\theta$ 的值
> 2. 对于 $i = 1, 2,\ldots,n$，设
> $$Q_i\left(z^{(i)}\right)=P\left(z^{(i)} \mid x^{(i)} ; \theta\right)$$
> 3. 更新参数
> $$\theta =\arg \max _\theta \sum_i \sum_{z^{(i)}} Q_i\left(z^{(i)}\right) \log \frac{P\left(x^{(i)}, z^{(i)} ; \theta\right)}{Q_i\left(z^{(i)}\right)}$$
> 4. 重复执行 2-3 直至算法收敛

在 *EM* 算法中，我们用 $t-1$ 时刻的参数 $\theta$ 来计算先验概率 $P\left(z^{(i)} \mid x^{(i)} ; \theta\right)$，然后根据这个先验概率对 $\theta$ 进行极大似然估计。

在推导 *EM* 算法的过程中，我们使用琴生不等式得到了

$$\log P(x ; \theta) \geq \sum_z Q(z) \log \frac{P(x, z ; \theta)}{Q(z)}$$

我们把右边的式子记作 *evidence lower bound(ELBO)*

$$\operatorname{ELBO}(x ; Q, \theta)=\sum_z Q(z) \log \frac{P(x, z ; \theta)}{Q(z)}$$

得到

$$\log P(x ; \theta) \geq \operatorname{ELBO}(x ; Q, \theta)$$

且当分布 $Q(z) = P(z | x ; \theta)$ 时取等。

---

## *2. Variational Inference(变分推理)*

对于可观测的随机变量 $X$ 和不可观测的随机变量 $Z$，我们希望求得先验概率 $P(z|x)$ 的分布，但是在实际问题中，这个东西往往是不可计算的，这是因为根据贝叶斯公式

$$P(z|x) = \frac{P(x|z)P(z)}{P(x)}$$

右边的分母 $P(x)$ 通常是无法计算的。

我们的想法是使用一个方便计算的分布 $Q(z)$ 来近似 $P(z|x)$，并使用 *KL* 散度来衡量它们之间的近似度，我们的目标是找到

$$Q^{*}(z) = \arg \min _{Q(z)} D_{\mathrm{KL}}[Q(z) \| P(z|x)]$$

但是这个优化问题是不可以直接求解的，因为它并没有绕过 $P(z|x)$ 不可计算的棘手问题，我们将它展开来找找线索

$$\begin{aligned} D_{\mathrm{KL}}[Q(z) \| P(z | x)] 
&= \sum_{z} Q(z) \log \frac{Q(z)}{P(z|x)} \\
&= -\sum_{z} Q(z) \left\{\log \frac{P(x,z)}{Q(z)} - \log P(x)\right\} \\
&= \log P(x) - \operatorname{ELBO}(z; Q)
\end{aligned}$$

我们发现由于 *KL* 散度的非负性，有

$$\begin{aligned}\log P(x) 
&= \operatorname{ELBO}(z ; Q) + D_{\mathrm{KL}}[Q(z) \| P(z \mid x)]\\
&\geq \operatorname{ELBO}(z ; Q) \end{aligned}$$

由于 $\log P(x)$ 是一个固定的量，只不过我们不知道它的值，因此极小化 *KL* 散度等价于极大化 *ELBO*.

还记得我们在 *EM* 算法中利用琴生不等式的取等条件得到了

$$Q(z)=P(z \mid x ; \theta)$$

此时右边的 *KL* 散度值为 $0$，这两者是等价的。只不过在一般情况下的变分推理中 $P(z \mid x)$ 是不可计算的东西，不能直接这样做。

即 *EM* 算法是变分推理的一种特殊情况。

有关变分推理的一个著名例子是 [*variational autoencoder(VAE)*](https://arxiv.org/pdf/1312.6114.pdf)，留坑待填。

---

## *Reference*

- https://gregorygundersen.com/blog/2021/04/16/variational-inference/
- https://zhuanlan.zhihu.com/p/138184201
- https://arxiv.org/pdf/1601.00670.pdf
- https://arxiv.org/pdf/1312.6114.pdf
