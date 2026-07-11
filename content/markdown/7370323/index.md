---
type: markdown
title: 强化学习重学系列(13) Imitation Learning
slug: "7370323"
order: 6
date: 2025-04-21
updatedAt: 2026-07-08 23:57:58
tags:
  - 模仿学习
  - 强化学习
published: true
category: machine-learning
---

## *1. Behavior Cloning(行为克隆)*

在传统的强化学习任务中，我们通常通过最大化累计奖励来学习最优策略，这种方式简单直接，而且在可以获得较多训练数据的情况下有较好的表现。

然而现实中很多序列决策问题并不能很好的设计出奖励函数，而传统的强化学习算法又高度依赖于奖励函数，因此，当我们不知道真实的奖励函数时，问题就变得复杂起来了。

具体来讲，对于一个 *MDP* 模型 $(\mathcal{S}, \mathcal{A}, \mathcal{R}, p, \gamma)$，我们不知道真实的奖励函数 $r(s,a)\in [0,1]$，但是我们有一系列专家轨迹数据集 

$$\mathcal{D}=\left(s_i^{*}, a_i^{*}\right)_{i=1}^M \sim d^{\pi^{*}}$$

这里我们的专家数据集是状态动作对的形式，而专家策略 $\pi^{*}$ 则被认为是该场景下的最优策略，我们的目标是从数据集 $\mathcal{D}$ 中学到一个和 $\pi^{*}$ 一样好的策略。

比较自然的想法是直接使用监督学习

$$\widehat{\pi}=\arg \min _{\pi \in \Pi} \sum_{i=1}^M \ell\left(\pi, s^{*}_{i}, a^{*}_{i}\right)$$

其中损失函数可以选择对数似然

$$\ell\left(\pi, s, a\right)=-\ln \pi\left(a | s\right)$$

对于连续动作，分类问题变成了回归问题，可以选择均方误差

$$\ell\left(\pi, s, a\right)=\left\|\pi(s)-a\right\|_2^2$$

通过这种方式得到的策略 $\widehat{\pi}$ 表现如何呢？

> **Theorem 1. BC Performance.** 假设监督学习成功运行，即对于学习误差 $\epsilon>0$ 有
> $$\mathbb{E}_{s \sim d_\mu^{\pi^{*}}} \mathbf{1}\left[\widehat{\pi}(s) \neq \pi^{\star}(s)\right] \leq \epsilon$$ 那么学习策略 $\widehat{\pi}$ 满足
> $$v^{\pi^{*}}-v^{\hat{\pi}} \leq \frac{2\epsilon}{(1-\gamma)^2}$$

这个定理给出了学习策略和最优策略差距的一个上界，且当学习误差 $\epsilon \rightarrow 0$ 时，学习策略的表现和最优策略一样好。我们使用 *PDL* 来证明它

$$\begin{aligned}(1-\gamma)\left(v^{\pi^{*}}-v^{\hat{\pi}}\right)
&=\mathbb{E}_{s \sim d^{{\pi^{*}}}_{\mu}} A^{\hat{\pi}}\left(s, \pi^{*}(s)\right) \\
&=\mathbb{E}_{s \sim d^{{\pi^{*}}}_{\mu}} A^{\hat{\pi}}\left(s, \pi^{*}(s)\right)-\mathbb{E}_{s \sim d^{{\pi^{*}}}_{\mu}} A^{\hat{\pi}}(s, \widehat{\pi}(s)) \\
&\leq \mathbb{E}_{s \sim d^{{\pi^{*}}}_{\mu}} \frac{2}{1-\gamma} \mathbf{1}\left\{\hat{\pi}(s) \neq \pi^{*}(s)\right\} \\
&\leq \frac{2\epsilon}{(1-\gamma)^2}
\end{aligned}$$

我们解释一下推导过程

1. 由于策略函数对自身的优势为 $0$，我们可以直接引入 $\mathbb{E}_{s \sim d_{\hat{\mu}}^*} A^{\hat{\pi}}(s, \widehat{\pi}(s))$

2. 观察式子 $$\mathbb{E}_{s \sim d^{{\pi^{*}}}_{\mu}} A^{\hat{\pi}}\left(s, \pi^{*}(s)\right)-\mathbb{E}_{s \sim d^{{\pi^{*}}}_{\mu}} A^{\hat{\pi}}(s, \widehat{\pi}(s))$$
    - 当 $\pi^{*}(s) = \hat{\pi}(s)$ 时，它的值为 $0$
    - 当 $\pi^{*}(s) \neq \hat{\pi}(s)$ 时，由于策略函数 $A^{\pi}(s,a)\in [-\frac{1}{1-\gamma},\frac{1}{1-\gamma}]$，因此它的值 $\leq\frac{2}{1-\gamma}$
    
---

## *2. The Challenge of Behavior Cloning(行为克隆面临的挑战)*

<center><img src="/content-images/markdown/7370323/image-20260708-235707-469-fcgt.png" width=600px></center>

如图所示，我们举一个老司机开车的例子，图中蓝色的虚线是老司机的行驶轨迹，而红色虚线是学习策略得到的轨迹。

我们发现随着驾驶时间的推移，学习策略轨迹距离专家轨迹越来越远，最终撞墙。

- **Distribution Shift(分布偏移)** 当学习策略轨迹出现偏离时，智能体很有可能会遇到不在训练集 $\mathcal{D}$ 中的状态动作对 $(s,a)$，因此智能体在这种情况下是没有专家指导的，它会放飞自我。
- **Compounding Errors(复合误差)** 监督学习误差仅影响到某次推理的结果，但是在连续决策过程中，每次误差可以随时间累积而最终导致显著不同的策略轨迹，一步错步步错。

由于这些问题的存在，*BC* 算法非常依赖于数据集的健壮性。
