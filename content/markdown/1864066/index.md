---
type: markdown
title: 强化学习重学系列(3) Dynamic Programming
slug: "1864066"
order: 17
date: 2024-05-31
updatedAt: 2026-07-08 23:53:01
tags:
  - 强化学习
published: true
category: machine-learning
---

## *1. Policy Iteration(策略迭代)*

众所周知，传统的动态规划算法的思想是将最优化问题分解为最优化若干个子问题，并通过递推关系得到原问题的解，我们回顾状态价值函数的 *Bellman* 方程

$$v_\pi(s)=\sum_a \pi(a | s) \sum_{s^{\prime}, r} p\left(s^{\prime}, r \mid s, a\right)\left[r+\gamma v_\pi\left(s^{\prime}\right)\right]$$

发现状态 $s$ 的价值可以根据所有的后续状态 $s^{\prime}$ 的价值递推得到，在给定的策略 $\pi$ 下，我们可以用迭代的方法来避免复杂的解线性方程组问题，我们把这个迭代求解的过程称为 *policy evaluation(策略评估)*.

假设我们在第 $k$ 轮迭代时，计算出了所有状态的价值函数 $v_{k}(s)$，那么根据方程

$$v_{k+1}(s)=\sum_a \pi(a | s) \sum_{s^{\prime}, r} p\left(s^{\prime}, r \mid s, a\right)\left[r+\gamma v_{k}\left(s^{\prime}\right)\right]$$

可以得到 $k+1$ 轮的结果，随着 $k\rightarrow \infty$，状态价值逐渐收敛 $v_{k}\rightarrow v_{\pi}$.

> **Method 1. Policy Evaluation(策略评估).** 对于给定的策略 $\pi$ 和误差界 $\theta > 0$，策略评估的迭代算法如下：
> 
> 1. 初始化所有状态 $s\in\mathcal{S}$ 的价值函数 $v_{0}(s)$
> 2. 枚举 $k=0,1,2,\cdots,\infty$，更新状态价值函数 $$v_{k+1}(s)=\sum_a \pi(a | s) \sum_{s^{\prime}, r} p\left(s^{\prime}, r \mid s, a\right)\left[r+\gamma v_{k}\left(s^{\prime}\right)\right]$$
> 3. 计算迭代误差 $$\Delta = \max (|v_{k+1}(s)-v_{k}(s)|)$$
> 4. 重复执行迭代过程 2,3，直至 $\Delta < \theta$，得到 $v_{\pi}(s)$

我们进行策略评估的目的是找到一个更好的策略 $\pi^{\prime} > \pi$，想象一下如果我们在状态 $s$ 选择了一个策略 $\pi$ 之外的行动 $a\neq \pi(s)$，并发现该行动的价值 $q_{\pi}(s,a) > v_{\pi}(s)$，那么我们的新策略

$$\pi^{\prime}(S_{t}) = \begin{cases}a, & \text { if } S_{t} =s \\ \pi(S_{t}), & \text { otherwise }\end{cases}$$

一定优于老策略 $\pi$，事实上这是完全正确的。

> **Theorem 2. Policy Improvement Theorem(策略提升定理).** 给定两个策略 $\pi, \pi^{\prime}$，若对于所有的 $s\in\mathcal{S}$ 满足
> $$q_\pi\left(s, \pi^{\prime}(s)\right) \geq v_\pi(s)$$ 那么策略 $\pi^{\prime}$ 一定优于 $\pi$，即 $\pi^{\prime} > \pi$.

我们只需要不断利用条件 $v_\pi(s) \leq  q_\pi\left(s, \pi^{\prime}(s)\right) $ 对 $v_{\pi}$ 进行缩放，就能证明它

$$\begin{aligned}
v_\pi(s) & \leq q_\pi\left(s, \pi^{\prime}(s)\right) \\
& =\mathbb{E}\left[R_{t+1}+\gamma v_\pi\left(S_{t+1}\right) \mid S_t=s, A_t=\pi^{\prime}(s)\right] \\
& =\mathbb{E}_{\pi^{\prime}}\left[R_{t+1}+\gamma v_\pi\left(S_{t+1}\right) \mid S_t=s\right] \\
& \leq \mathbb{E}_{\pi^{\prime}}\left[R_{t+1}+\gamma q_\pi\left(S_{t+1}, \pi^{\prime}\left(S_{t+1}\right)\right) \mid S_t=s\right] \\
& =\mathbb{E}_{\pi^{\prime}}\left[R_{t+1}+\gamma R_{t+2}+\gamma^2 v_\pi\left(S_{t+2}\right) \mid S_t=s\right] \\
& \leq \mathbb{E}_{\pi^{\prime}}\left[R_{t+1}+\gamma R_{t+2}+\gamma^2 R_{t+3}+\gamma^3 v_\pi\left(S_{t+3}\right) \mid S_t=s\right] \\
& \leq \mathbb{E}_{\pi^{\prime}}\left[R_{t+1}+\gamma R_{t+2}+\gamma^2 R_{t+3}+\gamma^3 R_{t+4}+\cdots \mid S_t=s\right] \\
& =v_{\pi^{\prime}}(s) .
\end{aligned}$$

有了这个定理的保证，我们只需要在状态 $s$ 处贪心选择最大价值的行动

$$\begin{aligned}
\pi^{\prime}(s) & = \underset{a}{\operatorname{argmax}} q_\pi(s, a) \\
& =\underset{a}{\operatorname{argmax}} \mathbb{E}\left[R_{t+1}+\gamma v_\pi\left(S_{t+1}\right) \mid S_t=s, A_t=a\right] \\
& =\underset{a}{\operatorname{argmax}} \sum_{s^{\prime}, r} p\left(s^{\prime}, r \mid s, a\right)\left[r+\gamma v_\pi\left(s^{\prime}\right)\right]
\end{aligned}$$

就能得到一个更好的策略 $\pi^{\prime}$，然后对 $\pi^{\prime}$ 进行策略评估得到新的状态价值函数，不断迭代更新，就能得到最优策略与最优价值函数。

> **Method 3. Policy Iteration(策略迭代).** 策略迭代算法流程如下：
> 
> 1. 初始化策略函数 $\pi_{0}(s)$
> 2. 枚举 $k=0,1,2,\cdots,\infty$
> 3. 进行策略评估，更新状态价值函数 $$v_{k+1}(s) = \operatorname{PolicyEvaluation}(\pi_{k})$$
> 4. 进行策略提升，更新策略函数 $$\pi_{k+1}(s) =\underset{a}{\operatorname{argmax}} \sum_{s^{\prime}, r} p\left(s^{\prime}, r \mid s, a\right)\left[r+\gamma v_{k+1}\left(s^{\prime}\right)\right]$$
> 5. 重复执行 3,4 直至 $\pi_{k+1} = \pi_{k}$，得到最优策略 $\pi_{*}$ 和最优价值函数 $v_{*}(s)$

--- 

## *2. Value Iteration(价值迭代)*

策略迭代的最大缺点是每一次迭代过程都需要执行一次策略评估，而策略评估本身就是一个迭代过程，且实际上我们并不需要每次精确地评估出 $v_{\pi}(s)$ 的价值。

回顾最优化 *Bellman* 方程

$$v_*(s)=\max _a \sum_{s^{\prime}, r} p\left(s^{\prime}, r \mid s, a\right)\left[r+\gamma v_*\left(s^{\prime}\right)\right]$$

如果我们直接使用这个方程对价值函数进行迭代，那么算法会简单很多，事实上这样做的本质就是在策略评估阶段仅进行一次迭代。

> **Method 4. Value Iteration(价值迭代).** 对于给定的误差界 $\theta$，价值迭代算法流程如下：
>
> 1. 初始化所有状态 $s\in\mathcal{S}$ 的价值函数 $v_{0}(s)$
> 2. 枚举 $k=0,1,2,\cdots,\infty$，更新状态价值函数 $$v_{k+1}(s)=\max _a \sum_{s^{\prime}, r} p\left(s^{\prime}, r \mid s, a\right)\left[r+\gamma v_k\left(s^{\prime}\right)\right]$$
> 3. 计算迭代误差 $$\Delta = \max (|v_{k+1}(s)-v_{k}(s)|)$$
> 4. 重复执行迭代过程 2,3，直至 $\Delta < \theta$，得到 $v_{*}(s)$，对应的最优策略为 $$\pi_{*}(s)=\arg \max _a \sum_{s^{\prime}, r} p\left(s^{\prime}, r \mid s, a\right)\left[r+\gamma v_{*}\left(s^{\prime}\right)\right]$$

---

## *3. Generalized Policy Iteration(广义策略迭代)*

在之前的讨论中，我们看到 *PI(策略评估)* 是对策略进行完全评估后再进行提升，而 *VI(价值评估)* 则是只进行一步评估后进行提升

而 *GPI(广义策略迭代)* 则是对 *PI* 和 *VI* 的统一框架，它强调策略评估和提升的交替进行，而不严格规定二者的执行频率和精度，最终的结果都将是收敛到最优价值函数和最优策略，正如下图所示的那样

<center>![title](/content-images/external/2549014b250cac742b148abb5aa0b759.png)</center>

基于动态规划的方法虽然比求解线性方程组高效了很多，但是强依赖于已知环境的状态转移函数 $p(s^{\prime},r|s,a)$，也就是说它是一种 *model-based(依赖建模)* 的强化学习方法。如果是未知状态转移函数的 *model-free(不依赖建模)* 的环境，这种方法就失效了。

在下一章中我们将介绍 *Monte Carlo method(蒙特卡罗方法)* 来解决 *model free* 的问题。
