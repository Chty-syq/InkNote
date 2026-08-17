---
type: markdown
title: Generative Adversarial Networks
slug: "8209333"
order: 4
date: 2025-05-15
updatedAt: 2026-07-10 15:02:14
tags:
  - 深度学习
published: false
category: machine-learning
---

## *1. Introduction*

生成对抗网络是使用对抗过程来获得生成模型的深度学习框架，主要由 *generator(生成器)* 和 *discriminator(判别器)* 两部分组成，如图所示

<center>![](/content-images/external/c4f9437dc39a72c808fe9bd5cbda7df4.jpg)</center>

判别器 $D(x)$ 是一个由神经网络建模的可微函数，它的目标是判断输入数据 $x$ 是否来自真实数据集 $\mathbb{P}_{\text{data}}(x)$，因此其参数应最大化

$$\mathbb{E}_{x \sim \mathbb{P}_{\text {data}}} \log D(x)$$

这个式子实质上是正样本的 *log-loss function*，最大化这一项意味着当 $x\sim \mathbb{P}_{\text{data}}(x)$ 时，有 $D(x) = 1$.

生成器 $G(z)$ 也是一个由神经网络建模的可微函数，对于输入特征 $z\sim \mathbb{P}_{z}(z)$，它的任务是使生成数据 $G(z)$ 尽可能的接近真实数据，从而欺骗判别器 $D$，达到以假乱真的效果。

我们的目标是

$$\min_{G}\max_{D} \mathbb{E}_{x \sim \mathbb{P}_{\text{data}}}\log D(x)+\mathbb{E}_{z\sim \mathbb{P}_{z}}\log (1-D(G(z)))$$

也就是说判别器 $D$ 要使得正样本的期望尽可能大(判定真实数据)，也要使得负样本的期望尽可能小(判定伪造数据)，生成器 $G$ 则是要尽可能的欺骗最佳判别器，使之无法判定正负样本。设

$$V(D,G) = \mathbb{E}_{x \sim \mathbb{P}_{\text{data}}}\log D(x)+\mathbb{E}_{z\sim \mathbb{P}_{z}}\log (1-D(G(z))) $$

我们的目标就是解这个最大最小问题

$$\min_{G}\max_{D} V(D,G)$$

> **Method 1. Generative Adversarial Network(生成对抗网络).** 对于分别用参数 $\psi,\theta$ 建模的判别器 $D$ 和生成器 $G$，一轮训练的流程如下：
>
> 1. 训练判别器
>   - 从输入特征分布 $\mathbb{P}_{z}$ 中采样得到 $\left\{z^{(1)}, \ldots, z^{(m)}\right\}$
>   - 从真实数据分布 $\mathbb{P}_{\text{data}}$ 中采样得到 $\left\{x^{(1)}, \ldots, x^{(m)}\right\}$
>   - 梯度上升更新判别器参数 $$\nabla_{\psi} \frac{1}{m} \sum_{i=1}^m\left[\log D\left(x^{(i)}\right)+\log \left(1-D\left(G\left(z^{(i)}\right)\right)\right)\right]$$
> 2. 训练生成器
>   - 从输入特征分布 $\mathbb{P}_{z}$ 中采样得到 $\left\{z^{(1)}, \ldots, z^{(m)}\right\}$
>   - 梯度下降更新生成器参数 $$\nabla_{\theta} \frac{1}{m} \sum_{i=1}^m \log \left(1-D\left(G\left(z^{(i)}\right)\right)\right)$$

训练过程如下图所示

<center>![](/content-images/external/4475855b1a8383461d26eaba4275f31d.jpg)</center>


在训练过程中，完全优化判别器 $D$ 会产生过高的计算成本，且在有限数据集上会导致过拟合，因此我们通常对 $D$ 进行 $k$ 步迭代，然后对 $G$ 进行一步迭代，两者交替进行。

这样做的目的是使得 $G$ 的变化较为缓慢，从而使 $D$ 保持在其最优解附近。

在实际训练中，当生成器 $G $的性能较差时，判别器 $D$ 会以高置信度拒绝生成样本，此时损失项 $\log (1-D(G(z)))$ 的梯度趋近于零(梯度消失)，导致生成器无法通过反向传播获得有效的更新信号。

为了缓解这一问题，可以将生成器 $G$ 的训练目标从最小化 $\log (1-D(G(z)))$ 调整为最大化 $\log D(G(z))$，两者是等价的。

---

## *2. Theoretical Analysis(理论分析)*

设生成器的分布 $G(z)\sim \mathbb{P}_{G}$，为了说明算法的有效性，我们需要证明解优化问题

$$\min _G \max _D V(D, G)$$

得到的生成器 $G$ 满足 $\mathbb{P}_{G} = \mathbb{P}_{\text{data}}$，这是 *GAN* 的核心理论。

> **Theorem 2.** 对于给定的生成器 $G$，最优判别器 $$D^{*}(x) = \frac{\mathbb{P}_{\text{data}}(x)}{\mathbb{P}_{\text{data}}(x)+\mathbb{P}_{G}(x)}$$

证明：训练判别器的过程是在计算

$$\begin{aligned}D^{*}(x) 
&= \max_{D} V(D,G) \\
&= \max_{D}\mathbb{E}_{x \sim \mathbb{P}_{\text{data}}}\log D(x)+\mathbb{E}_{z\sim \mathbb{P}_{z}}\log (1-D(G(z))) \\
&= \max_{D}\mathbb{E}_{x \sim \mathbb{P}_{\text{data}}}\log D(x)+\mathbb{E}_{x\sim \mathbb{P}_{G}}\log (1-D(x)) \\
&= \max_{D} \int_{x}\left\{\mathbb{P}_{\text{data}}(x)\log D(x)+ \mathbb{P}_{G}(x)\log (1-D(x))\right\}dx
\end{aligned}$$

注意到积分项是如下的函数形式

$$f(y)=a \log y+b \log (1-y)$$

可以求得其在 $(0,1)$ 上的最大值点 $y=\frac{a}{a+b}$，因此

$$D^{*}(x) = \frac{\mathbb{P}_{\text{data}}(x)}{\mathbb{P}_{\text{data}}(x)+\mathbb{P}_{G}(x)}$$

这里的数据分布 $\mathbb{P}_{\text{data}}(x),\mathbb{P}_{G}(x)$ 都是未知的，因此不能直接通过这个式子来计算最佳判别器。

> **Theorem 3.** 设函数 $$C(G) = \max_{D}V(D,G)$$ 那么生成器的训练就是最小化 $C(G)$ 的过程，$C(G)$ 达到最小值点当且仅当 $\mathbb{P}_{G} = \mathbb{P}_{\text{data}}$，对应的最小值 $$\min_{G} C(G) = -\log4$$

首先我们假设 $\mathbb{P}_{G} = \mathbb{P}_{\text{data}}$，此时根据 *Theorem 2*，最优的判别器

$$D^{*}(x) = \frac{\mathbb{P}_{\text {data }}(x)}{\mathbb{P}_{\text {data }}(x)+\mathbb{P}_G(x)} = \frac{1}{2}$$

也就是说判别器被彻底混淆了，而

$$\begin{aligned}C(G) 
&= V(D^{*},G) \\
&= \mathbb{E}_{x \sim \mathbb{P}_{\text {data }}} \log \frac{1}{2}+\mathbb{E}_{x \sim \mathbb{P}_G} \log \frac{1}{2}\\
&= -\log4
\end{aligned}$$

接下来需要证明这个值就是 $C(G)$ 的最小值，我们对 $C(G)$ 做一些变形

$$\begin{aligned}C(G) 
&= V(D^{*},G) \\
&= \mathbb{E}_{x\sim \mathbb{P}_{\text {data }}} \log \left(\frac{\mathbb{P}_{\text {data }}(x)}{\mathbb{P}_{\text {data }}(x)+\mathbb{P}_G(x)}\right)+\mathbb{E}_{x\sim \mathbb{P}_{G}} \log \left(\frac{\mathbb{P}_{G}(x)}{\mathbb{P}_{\text {data }}(x)+\mathbb{P}_G(x)}\right)
\end{aligned}$$

我们发现这两个期望表达式和 *KL* 散度的形式一模一样，但是 $\mathbb{P}_{\text {data }}(x)+\mathbb{P}_G(x)$ 并不是一个概率分布，需要将其写成

$$\frac{\mathbb{P}_{\text {data }}(x)+\mathbb{P}_G(x)}{2}$$

的形式，才能保证它是一个概率分布，因此

$$\begin{aligned}C(G) 
&= - \log4 +\mathbb{E}_{x\sim \mathbb{P}_{\text {data }}} \log \left(\frac{2\cdot\mathbb{P}_{\text {data }}(x)}{\mathbb{P}_{\text {data }}(x)+\mathbb{P}_G(x)}\right)+\mathbb{E}_{x\sim \mathbb{P}_{G}} \log \left(\frac{2\cdot\mathbb{P}_{G}(x)}{\mathbb{P}_{\text {data }}(x)+\mathbb{P}_G(x)}\right) \\
&= -\log4 + D_{\mathrm{KL}}\left(\mathbb{P}_{\text {data }} \| \frac{\mathbb{P}_{\text {data }}(x)+\mathbb{P}_G(x)}{2}\right) + D_{\mathrm{KL}}\left(\mathbb{P}_{G} \| \frac{\mathbb{P}_{\text {data }}(x)+\mathbb{P}_G(x)}{2}\right) \\
&=  -\log4 + 2 D_{\mathrm{JS}}(\mathbb{P}_{\text {data }} \| \mathbb{P}_{G}) \\
&\geq  -\log4 
\end{aligned}$$

其中 $D_{\mathrm{JS}}$ 表示 *Jenson-Shannon divergence(JS散度)*，等号成立当且仅当 $\mathbb{P}_G=\mathbb{P}_{\text {data }}$，证明完毕。

从推导过程可以看出，生成器 $G$ 的训练过程本质上是在最小化 $\mathbb{P}_G,\mathbb{P}_{\text {data }}$ 间的 *JS* 散度，当这两个分布重合程度很小时，*JS* 散度将面临梯度消失的问题，这使得 *GAN* 的训练很不稳定。

- 若判别器 $D$ 训练得太好，生成器梯度消失
- 若判别器 $D$ 训练得不好，生成器梯度不准，四处乱跑。

也就是说 *GAN* 要求判别器训练得不好不坏才行，而这个火候又很难把握，所以 *GAN* 的训练非常困难。

之后我们会介绍引入 *Wasserstein* 度量来解决这个问题。

---

## *Appendix: The Jenson-Shannon Divergence*

> **Definition 4.** 对于概率分布 $P,Q$，定义 *JS* 散度 
> $$D_\mathrm{JS}(P \| Q)=\frac{1}{2} D_\mathrm{KL}\left(P \| M\right)+\frac{1}{2} D_\mathrm{KL}\left(Q \| M\right)$$ 其中 $M=\frac{P+Q}{2}$，*JS* 散度在 *KL* 散度的基础上做了改进，它为衡量两个概率概率分布之间的差异提供了一个对称性指标。

<div></div>

> **Theorem 5. The Property of DJS.**
> 
> - **对称性：** $D_{\mathrm{JS}}(P \| Q) = D_{\mathrm{JS}}(Q \| P)$
> - **非负性：** $D_{\mathrm{JS}}(P \| Q)\geq 0$ 等号成立当且仅当 $P=Q$
> - **有界性：** $D_{\mathrm{JS}}(P \| Q)\leq \log 2$ 当两个分布完全不重叠时等号成立

---

## *Reference*

- https://arxiv.org/pdf/1406.2661
- https://srome.github.io//An-Annotated-Proof-of-Generative-Adversarial-Networks-with-Implementation-Notes/
- https://en.wikipedia.org/wiki/Jensen%E2%80%93Shannon_divergence
