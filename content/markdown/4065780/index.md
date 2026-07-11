---
type: markdown
title: Variational Auto-Encoding
slug: "4065780"
order: 23
date: 2023-06-16
updatedAt: 2026-07-10 21:26:21
tags:
  - 机器学习
published: true
category: machine-learning
---

本文是对著名论文 [Auto-Encoding Variational Bayes](https://arxiv.org/pdf/1312.6114.pdf) 的解读，博主认为论文的行文思路有些抽象，在讲述 *idea* 的时候没有将具体的例子融合进去，而是将例子放在了最后面，其实先看例子能对理解正文起到很大的帮助。

在阅读论文的过程中参考了许多网上的解读，感觉它们的讲述更是不明所以，于是本文应运而生。

---

## *1. Problem Scenario(问题场景)*

> **Problem 1.** 给定数据集 $\mathbf{X}=\left\{x^{(i)}\right\}_{i=1}^n$，其中 $x^{(i)}$ 是独立同分布的随机变量，假设 $x^{(i)}$ 的生成依赖于某个不可观测的随机变量 $z$，即
> $$p(x^{(i)},z^{(i)}) = p(z^{(i)}) p(x^{(i)}| z^{(i)})$$ 也就是说，我们使用如下方法生成数据集
>
> 1. 使用先验分布 $p_{\theta}(z)$ 生成随机变量 $z^{(i)}$
> 2. 使用条件分布 $p_{\theta}(x|z)$ 生成 $x^{(i)}$
> 
> 这里的两个分布 $p_{\theta}(z),p_{\theta}(x|z)$ 是几乎处处可微的，参数 $\theta$ 以及生成的 $z^{(i)}$ 是未知的。我们的目标是在数据集 $\mathbf{X}$ 上求参数 $\theta$ 的值。

在实际应用中，我们常常会对 $p_{\theta}(z),p_{\theta}(x|z)$ 做出一些假设，例如可以假设它们是参数为 $\theta$ 的神经网络，但是在本文的理论探讨部分，我们不对它们做出这种形式上的假设，而是讨论它们可以是任意分布的情况。

这个问题主要有以下几个难点:

- 边际分布 $p_{\theta}(x) = \int p_{\theta}(z) p_{\theta}(x|z) d z$ 往往是不可计算的，这导致后验分布
$$p_\theta(z | x)=\frac{p_\theta(x | z) p_\theta(z)}{p_\theta(x)}$$ 不可计算，因此无法使用 *EM* 算法。
- 当数据集过大时，蒙特卡罗之类的采样方法开销巨大。

为了解决这些问题，我们引入分布 $q_{\phi}(z|x)$ 来近似先验分布 $p_{\theta}(z|x)$，与 *EM* 算法不同，我们引入了新的参数 $\phi$，这个参数的计算不要求期望表达式拥有封闭形式，我们会介绍一种新的方法来计算它。

从编码的角度来看

- $q_\phi(z | x)$ 是编码器，因为有了这个分布，我们就能从数据点 $x^{(i)}$ 生成 *latent space* 中的 $z^{(i)}$
- $p_\theta(x | z)$ 是解码器，因为有了这个分布，我们就能从 *latent space* 中的 $z^{(i)}$ 还原出数据点 $x^{(i)}$

这里不对 *latent space* 做翻译，因为很难找到与之对应的中文单词，它实际上表达的是一个中间过程中产生的中间结果，就像神经网络中的隐藏层产生的输出一样。

$$x^{(i)} \underset{\text{Encoder}}{\stackrel{q_{\phi}(z|x)}{\longrightarrow}} z^{(i)}  \underset{\text{Decoder}}{\stackrel{p_{\theta}(x|z)}{\longrightarrow}} x^{(i)} $$

求出参数 $\theta,\phi$ 后，我们就可以用这两个分布完成 *latent space* $z^{(i)}$ 的提取，这就是 *VAE* 的基本思想。

---

## *2. The Variational Bound(变分下界)*

我们的对数似然函数

$$\ell(\theta,\phi) = \sum_{i=1}^{n} \log p({x^{(i)};\theta,\phi})$$

根据变分推理的那套公式，我们有

$$\log p\left(x^{(i)} ; \theta, \phi\right) = D_{\mathrm{KL}}[q_{\phi}(z|x^{(i)}) \| p_{\theta}(z | x^{(i)})] + \operatorname{ELBO}(x^{(i)} ; \theta,\phi) $$

其中，证据下界

$$\begin{eqnarray*}\operatorname{ELBO}(x^{(i)} ; \theta,\phi) 
&=& \mathbb{E}_{z\sim q_{\phi}(z|x^{(i)})} \left[ \log \frac{p_\theta\left(x^{(i)}, z\right)}{q_\phi\left(z | x^{(i)}\right)} \right] \tag{2.1} \\
&=& \sum_z q_{\phi}(z|x^{(i)}) \log \frac{p_{\theta}(x^{(i)}, z )}{q_{\phi}(z|x^{(i)})} \\
&=& \sum_z q_{\phi}(z|x^{(i)}) \log \frac{p_{\theta}(x^{(i)} | z )p_{\theta}(z)}{q_{\phi}(z|x^{(i)})} \\
&=& -D_{\mathrm{KL}}[q_{\phi}(z|x^{(i)}) \| p_{\theta}(z)] + \mathbb{E}_{z\sim q_{\phi}(z|x^{(i)})} \left[ \log p_{\theta}(x^{(i)} | z ) \right] \tag{2.2}
\end{eqnarray*} $$

由于 *KL* 散度的非负性，我们的目标就是最优化这个 *ELBO*，也就是说要算 $(2.1)$ 的微分。

如果 $(2.2)$ 中的 *KL* 散度能够求得解析式的话，直接计算 $(2.2)$ 中期望的微分会更好。

---

## *3. Intractable Differential of Expectation(难以计算的期望微分)*

我们考虑一个形式化的问题，设 $f_{\theta}(z)$ 是一个带参数的函数，且 $z$ 服从分布 $p(z)$，我们想要计算

$$\mathbb{E}_{z\sim p(z)}\left[f_\theta(z)\right]$$

的梯度，这个问题是不困难的

$$\begin{aligned}
\nabla_\theta \mathbb{E}_{z\sim p(z)}\left[f_\theta(z)\right] & =\nabla_\theta\left[\int_z p(z) f_\theta(z) d z\right] \\
& =\int_z p(z)\left[\nabla_\theta f_\theta(z)\right] d z \\
& =\mathbb{E}_{z\sim p(z)}\left[\nabla_\theta f_\theta(z)\right]
\end{aligned}$$

如此，我们可以用蒙特卡罗采样的方法在分布 $p(z)$ 上采样一系列的 $z^{(l)}$ 来计算梯度

$$LHS = \frac{1}{L}\sum_{l=1}^{L} \nabla_\theta f_\theta(z^{(l)})$$

但是，如果 $z$ 的分布函数 $p(z)$ 也是带参数的呢？

$$\begin{aligned}
\nabla_\theta \mathbb{E}_{z\sim p_\theta(z)}\left[f_\theta(z)\right] & =\nabla_\theta\left[\int_z p_\theta(z) f_\theta(z) d z\right] \\
& =\int_z f_\theta(z) \nabla_\theta p_\theta(z) d z+\int_z p_\theta(z) \nabla_\theta f_\theta(z) d z \\
& =\int_z f_\theta(z) \nabla_\theta p_\theta(z) d z+\mathbb{E}_{z\sim p_\theta(z)}\left[\nabla_\theta f_\theta(z)\right]
\end{aligned}$$

我们不能保证第一项是一个期望，我们没法在 $\nabla_\theta p_\theta(z)$ 上进行蒙特卡罗采样，因为它不一定能算出解析式。问题似乎在这里卡住了。

---

## *4. The Reparameterization Trick(重参数技巧)*

我个人认为这是文章中最为精妙的地方，我们举一个例子来说明重参数化的妙处。

假设 $z\sim N(\mu, \sigma^{2})$，我们现在要求

$$\nabla_\mu \mathbb{E}_{z \sim N(\mu,\sigma^{2})}\left[f(z;\mu,\sigma)\right]$$

由于 $z$ 的分布是带参数的，根据上一节的推导我们知道它是无法采样计算的，设

$$z = \mu  + \sigma\epsilon , \quad \epsilon \sim N(0,1)$$

那么我们要求的东西就变成了

$$\nabla_\mu \mathbb{E}_{\epsilon \sim N(0,1)}\left[f(\mu  + \sigma\epsilon;\mu,\sigma)\right]$$

现在我们要采样的分布变成了 $\epsilon \sim N(0,1)$，它是不带参数的，可以直接采样计算！

$$LHS = \frac{1}{L} \sum_{l=1}^L f\left(\mu+\sigma \epsilon^{(l)}; \mu, \sigma\right)$$

现在回到我们的问题，来看更为一般的情况，我们要计算的东西是

$$\nabla_{\phi} \mathbb{E}_{z \sim q_\phi\left(z | x^{(i)}\right)}\left[f(z; \theta, \phi)\right]$$

我们使用

$$z = g_{\phi} (\epsilon, x^{(i)}), \quad \epsilon \sim p(\epsilon)$$

进行重参数化，在 $p(\epsilon)$ 上采样一系列的 $\epsilon^{l}$，得到

$$\nabla_\phi \mathbb{E}_{z \sim q_\phi\left(z | x^{(i)}\right)}[f(z ; \theta, \phi)] = \frac{1}{L} \sum_{l=1}^L \nabla_{\phi}f\left(g_{\boldsymbol{\phi}}\left(\boldsymbol{\epsilon}^{(l)}, \mathbf{x}^{(i)}\right)\right)$$

---

## *5. The SGVB Estimator And AEVB Algorithm*

现在回到 *ELBO* 的最优化问题，我们取

$$f(z; \theta, \phi) = \log \frac{p_\theta\left(x^{(i)}, z\right)}{q_\phi\left(z | x^{(i)}\right)}$$

得到

$$\operatorname{ELBO}\left(x^{(i)} ; \theta, \phi\right) = \frac{1}{L} \sum_{l=1}^{L} \log p_\theta\left(x^{(i)}, z^{(i,l)}\right) - \log q_\phi\left(z^{(i,l)} | x^{(i)}\right)$$

其中

$$z^{(i,l)} = g_{\phi}(\epsilon^{(l)},x^{(i)}), \quad \epsilon^{(l)}\sim p(\epsilon)$$

如此我们只需要求 *ELBO* 对各参数的梯度进行优化就行了，这就是 *stochastic gradient variational bayes(SGVB)* 估计器。

在数据集 $\mathbf{X}$ 上，我们的优化目标就是

$$L(\theta, \phi ; \mathbf{X}) = \sum_{i=1}^{n} \operatorname{ELBO}\left(x^{(i)} ; \theta, \phi\right) $$

我们可以在数据集上采样，每次使用一个小 *batch* 进行梯度下降，当 *batch* 的大小足够时，我们采样点的数量 $L$ 可以设置为 $1$.

这就是我们的 *auto-encoding variational bayes(AEVB)* 算法。

--- 

## *6. Example: Variational Auto-Encoder(变分自动编码器的例子)*

我们讲一个用神经网络来实现 *VAE* 的例子，假设先验为标准高斯分布

$$p_\theta(z)=N(0, I)$$

后验分布 $p_\theta(z | x^{(i)})$ 是基于 *MLP* 的神经网络，我们用一个具有对角方差的高斯分布来近似它

$$ q_{\phi}(z|x^{(i)})= N(\mu^{(i)}, (\sigma^{(i)})^{2} I)$$

我们使用重参数化技巧来分解 *latent* 变量

$$z^{(i,l)} = \mu^{(i)} + \sigma^{(i)} \odot \epsilon^{(l)},\quad \epsilon^{(l)}\sim N(0, I)$$

我们的优化目标为

$$\operatorname{ELBO}\left(x^{(i)} ; \theta, \phi\right) = -D_{\mathrm{KL}}\left[q_\phi\left(z | x^{(i)}\right) \| p_\theta(z)\right] + \frac{1}{L} \sum_{l=1}^L \log p_\theta\left(x^{(i)} | z^{(i, l)}\right)$$

这里的 $p_{\theta}(x|z)$ 是另一个神经网络，假设它的输出是高斯分布的，我们用 *MES* 来算它和真值之间的损失，而前面的 *KL* 散度可以直接计算

$$D_{\mathrm{KL}}\left[q_\phi\left(z | x^{(i)}\right) \| p_\theta(z)\right] = \frac{1}{2} \sum_{j=1}^J\left(1+\log \left(\left(\sigma_j^{(i)}\right)^2\right)-\left(\mu_j^{(i)}\right)^2-\left(\sigma_j^{(i)}\right)^2\right)$$

我们会在附录中说明这个东西是怎么算出来的。完整的计算图如下:

<center><img src="/content-images/external/2834c315e0beee16437b02cf5d1f1a9b.png" width=800px></center>

---

## *Appendix: The KL-Divergence of Guassion Case*

> **Lemma 2.** 对于两个多元高斯分布 $p_{1} = N(\mu_{1}, \Sigma_{1}), p_{2} = N(\mu_{2},\Sigma_{2})$，其中 $\mu_{1},\mu_{2}\in \mathbb{R}^{d}, \Sigma_{1},\Sigma_{2}\in\mathbb{R}^{d\times d}$，有
> $$D_{\mathrm{KL}}\left[p_1 \| p_2\right] = \frac{1}{2}\left[\log \frac{\left|\Sigma_2\right|}{\left|\Sigma_1\right|}-d+\operatorname{tr}\left(\Sigma_2^{-1} \Sigma_1\right)+\left(\mu_2-\mu_1\right)^T \Sigma_2^{-1}\left(\mu_2-\mu_1\right)\right]$$

根据多元高斯分布的概率密度函数表达式

$$p(x)=\frac{1}{(2 \pi)^{\frac{d}{2}} |\Sigma|^{\frac{1}{2}}} \exp \left(-\frac{1}{2}(x-\mu)^T \Sigma^{-1}(x-\mu)\right)$$

我们有

$$\begin{aligned}D_{\mathrm{KL}}\left[p_1 \| p_2\right] 
&= \mathbb{E}_{x \sim p_{1}(x)}\left[\log \frac{p_{1}(x)}{p_{2}(x)}\right] \\
&= \frac{1}{2}\log\frac{|\Sigma_{2}|}{|\Sigma_{1}|} + \frac{1}{2}\mathbb{E}_{x \sim p_{1}(x)}\left[-\left(x-\mu_1\right)^T \Sigma_1^{-1}\left(x-\mu_1\right)+\left(x-\mu_2\right)^T \Sigma_2^{-1}\left(x-\mu_2\right)\right] \\
&= \frac{1}{2}\log\frac{|\Sigma_{2}|}{|\Sigma_{1}|} + \frac{1}{2}\mathbb{E}_{x \sim p_{1}(x)}\left[-\operatorname{tr}\left( \Sigma_1^{-1}\left(x-\mu_1\right)\left(x-\mu_1\right)^T\right)+\operatorname{tr}\left(  \Sigma_2^{-1}\left(x-\mu_2\right)\left(x-\mu_2\right)^T\right)\right] 
\end{aligned}$$

先来处理期望里的第一项

$$\begin{aligned}\mathbb{E}_{x \sim p_1(x)}\left[\operatorname{tr}\left(\Sigma_1^{-1}\left(x-\mu_1\right)\left(x-\mu_1\right)^T\right)\right] 
&= \sum_{x}\operatorname{tr}\left(p_{1}(x)\Sigma_1^{-1}\left(x-\mu_1\right)\left(x-\mu_1\right)^T\right) \\ 
&= \operatorname{tr}\left(\sum_{x}p_{1}(x)\Sigma_1^{-1}\left(x-\mu_1\right)\left(x-\mu_1\right)^T\right) \\
&= \operatorname{tr}\left(\Sigma_1^{-1}\mathbb{E}_{x \sim p_1(x)}\left[\left(x-\mu_1\right)\left(x-\mu_1\right)^T\right]\right) \\
&= \operatorname{tr}\left(\Sigma_{1}^{-1}\Sigma\right) = d
\end{aligned}$$

这里我们引入了迹运算来将协方差矩阵提到外面，然后我们发现迹的期望等于期望的迹，把期望写到了里面，而这个期望刚好就是协方差。

再来处理第二项

$$\begin{aligned}\mathbb{E}_{x \sim p_1(x)}\left[\operatorname{tr}\left(\Sigma_2^{-1}\left(x-\mu_2\right)\left(x-\mu_2\right)^T\right)\right]
&= \operatorname{tr}\left(\Sigma_2^{-1}\mathbb{E}_{x \sim p_1(x)}\left[\left(x-\mu_2\right)\left(x-\mu_2\right)^T\right]\right) \\
&= \operatorname{tr}\left(\Sigma_2^{-1}\mathbb{E}_{x \sim p_1(x)}\left[\left(x-\mu_1\right)\left(x-\mu_1\right)^T + 2x(\mu_{1}^{T} - \mu_{2}^{T}) - \mu_{1}\mu_{1}^{T} + \mu_{2}\mu_{2}^{T}\right]\right) \\
&= \operatorname{tr}\left(\Sigma_2^{-1}\left\{\Sigma_{1} + 2\mu_{1}(\mu_{1}^{T} - \mu_{2}^{T}) - \mu_{1}\mu_{1}^{T} + \mu_{2}\mu_{2}^{T}\right\}\right)\\
&= \operatorname{tr}(\Sigma_2^{-1}\Sigma_{1}) + \operatorname{tr}\left(\mu_1^T \Sigma_2^{-1} \mu_1-2 \mu_1^T \Sigma_2^{-1} \mu_2+\mu_2^T \Sigma_2^{-1} \mu_2\right)\\
&= \operatorname{tr}(\Sigma_2^{-1}\Sigma_{1}) + \left(\mu_2-\mu_1\right)^T \Sigma_2^{-1}\left(\mu_2-\mu_1\right)
\end{aligned}$$

这里由于 $x-\mu_{2}$ 不好处理，我们引入 $\mu_{1}$ 对其进行修正，顺利分解计算了各部分的期望。

代入回去得到

$$D_{\mathrm{KL}}\left[p_1 \| p_2\right]=\frac{1}{2}\left[\log \frac{\left|\Sigma_2\right|}{\left|\Sigma_1\right|}-d+\operatorname{tr}\left(\Sigma_2^{-1} \Sigma_1\right)+\left(\mu_2-\mu_1\right)^T \Sigma_2^{-1}\left(\mu_2-\mu_1\right)\right]$$

<div></div>

> **Problem 3.** 给定两个概率分布 
$$q(z)=N (z ; \mu, \Sigma),\quad p(z) = N(0,I) $$ 其中 $\Sigma=\operatorname{diag}\left(\sigma_1^2, \ldots, \sigma_d^2\right)$，求
> $$D_{\mathrm{KL}}\left[q(z) \| p(z)\right] = \mathbb{E}_{z \sim q(x)}\left[\log \frac{q(x)}{p(x)}\right]$$

根据 *Lemma 2* 得到

$$\begin{aligned}D_{\mathrm{KL}}[q(z) \| p(z)] 
&= \frac{1}{2}\left[-\log |\Sigma|-d+\operatorname{tr}(\Sigma)+\mu^T \mu\right]\\
&= \frac{1}{2}\left[-\log\prod_{i=1}^{d}\sigma_{i}^{2}-d+\sum_{i=1}^{d}\sigma_{i}^{2}+\sum_{i=1}^{d}\mu_{i}^{2}\right] \\
&= \frac{1}{2} \sum_{i=1}^{d} \left\{\log(\sigma_{i}^{2}) - \sigma_{i}^{2} - \mu_{i}^{2} +1 \right\}
\end{aligned}$$

---

## *Reference*

- https://arxiv.org/pdf/1312.6114.pdf
- https://renns.top/post/64/
- https://gregorygundersen.com/blog/2018/04/29/reparameterization
- https://github.com/pytorch/examples/blob/main/vae/main.py
- https://stanford.edu/~jduchi/projects/general_notes.pdf (Page13)
- https://stats.stackexchange.com/questions/318748/deriving-the-kl-divergence-loss-for-vaes
- https://stats.stackexchange.com/questions/60680/kl-divergence-between-two-multivariate-gaussians
- https://stats.stackexchange.com/questions/7440/kl-divergence-between-two-univariate-gaussians
