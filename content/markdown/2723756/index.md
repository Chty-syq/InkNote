---
type: markdown
title: 强化学习重学系列(10) Policy Gradient
slug: "2723756"
order: 9
date: 2025-02-13
updatedAt: 2026-07-01 01:26:39
tags:
  - 强化学习
published: true
category: machine-learning
---

## *1. Policy Approximation(策略近似)*

到目前为止，我们介绍的大多数方法都是基于行动价值，通过学习各个行动的价值函数来选择行动，如果没有动作价值的估计，这些方法甚至无法定义其策略。这样的方法我们称为 *value-based method(基于价值的方法)*.

本文将介绍另一类的 *policy-based method(基于策略的方法)*，它们不依赖价值函数，直接学习一个参数化的策略，并根据此策略选择行动。尽管价值函数仍然可以用于优化策略参数，但在动作选择过程中并不是必需的。

我们使用 $\pi_\theta(a | s)$ 来近似策略函数，其中 $\theta$ 表示参数，函数的形式可以是任意的，它可以是一个深度神经网络，通常我们会用 *softmax* 操作来保证它是一个概率分布函数。

参数化的策略函数可以更加灵活的选择行动，在连续的策略参数 $\theta$ 下，动作概率 $\pi$ 作为 $\theta$ 的函数会平滑变化。

相较之下，在 *$\epsilon$-greedy* 策略中，如果某个动作的估计价值发生了极小的变化，导致了最优行动的改变，那么动作概率将会剧烈改变。

因此，基于策略的方法具有更强的收敛性保证。接下来我们需要评估 $\pi_\theta(a | s)$ 的表现，用以执行梯度上升算法。

#### **Metric 1: Average state value**

我们介绍第一种度量方式为状态价值的均值，即

$$\bar{v}_\pi=\mathbb{E}_{s \sim d}\left[v_\pi(s)\right] =\sum_{s \in \mathcal{S}} d(s) v_\pi(s)$$

其中 $d(s)\geq 0$ 表示状态 $s$ 的权重，我们可以把它看做一个关于状态 $s$ 的概率分布，我们有两种选取方式：

- 选取和策略 $\pi$ 无关的分布 $d_{0}$，例如 $$d_{0}(s) = \begin{cases}1, &s=s_{0} \\0, &s\neq s_{0}\end{cases}$$ 即智能体总是从初始状态开始决策。在这种情况下我们可以去掉价值度量中的角标记做 $\bar{v}$.
- 选取和策略 $\pi$ 有关的分布 $d_{\pi}$，例如使用稳态分布，它刻画了 MDP 在策略 $\pi$ 下的长期表现，如果状态 $s$ 的长期访问频率越高，它的权重就应该越大。

设智能体在策略 $\pi$ 下收集到的奖励序列为 $\left\{R_{t+1}\right\}_{t=0}^{\infty}$，我们的目标函数

$$\begin{aligned}J(\theta) 
& =\sum_{s \in \mathcal{S}} d(s) v_\pi(s) \\
& =\sum_{s \in \mathcal{S}} d(s) \mathbb{E}\left[\sum_{t=0}^{\infty} \gamma^t R_{t+1} | S_0=s\right] \\
&= \mathbb{E}\left[\sum_{t=0}^{\infty} \gamma^t R_{t+1}\right]
\end{aligned}$$

#### **Metric 2: Average reward**

第二种度量方式则是 *average one-step reward(单步平均奖励)*

$$\bar{r}_\pi  =\mathbb{E}_{s \sim d_\pi}\left[r_\pi(s)\right]=\sum_{s \in \mathcal{S}} d_\pi(s) r_\pi(s)$$

其中 $d_{\pi}$ 表示稳态分布，$r_{\pi}$ 表示即时奖励的期望

$$r_\pi(s) =\mathbb{E}_{a \sim \pi}[r(s, a)]= \sum_{a \in \mathcal{A}} \pi(a | s) r(s, a)$$

设智能体在策略 $\pi$ 下收集到的奖励序列为 $\left\{R_{t+1}\right\}_{t=0}^{\infty}$，我们的目标函数

$$J(\theta) = \bar{r}_\pi = \lim _{n \rightarrow \infty} \frac{1}{n} \mathbb{E}\left[\sum_{t=0}^{n-1} R_{t+1}\right]$$

这个式子并不显然，我们接下来尝试证明它。
 
> **Lemma 1.** 单步期望奖励 $\bar{r}_\pi$ 满足
> $$\bar{r}_\pi=\lim _{n \rightarrow \infty} \frac{1}{n} \mathbb{E}\left[\sum_{t=0}^{n-1} R_{t+1}\right]$$

首先我们证明对于任意的初始状态 $s_{0}$，有

$$\bar{r}_\pi=\lim _{n \rightarrow \infty} \frac{1}{n} \mathbb{E}\left[\sum_{t=0}^{n-1} R_{t+1} | S_0=s_0\right]$$

根据 *Cesàro mean* 定理(详见附录)，有

$$\text{LHS} = \lim _{t \rightarrow \infty} \mathbb{E}\left[R_{t+1} | S_0=s_0\right]$$

考察期望表达式 $\mathbb{E}\left[R_{t+1} | S_0=s_0\right]$，尝试将其展开得到

$$\begin{aligned}
\mathbb{E}\left[R_{t+1} | S_0=s_0\right] & =\sum_{s \in \mathcal{S}} \mathbb{E}\left[R_{t+1} | S_t=s, S_0=s_0\right] p^{(t)}\left(s | s_0\right) \\
& =\sum_{s \in \mathcal{S}} \mathbb{E}\left[R_{t+1} | S_t=s\right] p^{(t)}\left(s | s_0\right) \\
& =\sum_{s \in \mathcal{S}} r_\pi(s) p^{(t)}\left(s | s_0\right)
\end{aligned}$$

其中 $p^{(t)}\left(s | s_0\right)$ 表示 $t$ 步状态转移 $s\rightarrow s_{0}$ 的概率，第二个等号利用了马尔科夫性质。根据稳态分布的定义，

$$\lim _{t \rightarrow \infty} p^{(t)}\left(s | s_0\right)=d_\pi(s)$$

因此

$$\text{LHS}=\lim _{t \rightarrow \infty} \sum_{s \in \mathcal{S}} r_\pi(s) p^{(t)}\left(s | s_0\right) = \sum_{s \in \mathcal{S}} r_\pi(s) d_\pi(s)=\bar{r}_\pi$$

现在我们尝试去掉初始状态 $s_{0}$ 的影响，对于任意的状态分布函数 $d(s)$，有

$$\begin{aligned}
\lim _{n \rightarrow \infty} \frac{1}{n} \mathbb{E}\left[\sum_{t=0}^{n-1} R_{t+1}\right] & =\lim _{n \rightarrow \infty} \frac{1}{n} \sum_{s \in \mathcal{S}} d(s) \mathbb{E}\left[\sum_{t=0}^{n-1} R_{t+1} \mid S_0=s\right] \\
& =\sum_{s \in \mathcal{S}} d(s) \lim _{n \rightarrow \infty} \frac{1}{n} \mathbb{E}\left[\sum_{t=0}^{n-1} R_{t+1} \mid S_0=s\right] \\
&= \sum_{s \in \mathcal{S}} d(s) \bar{r}_\pi=\bar{r}_\pi
\end{aligned}$$

现在我们有了度量方法 $\bar{v},\bar{v}_{\pi},\bar{r}_{\pi}$ 来评估策略函数 $\pi_{\theta}$ 的表现，接下来只需计算其关于 $\theta$ 的梯度，就能执行梯度上升算法来进行参数优化，幸运的是我们有策略梯度定理。

> **Theorem 2. Policy Gradient Theorem(策略梯度定理).** $$\nabla J(\theta) = \sum_s \eta(s) \sum_a q_\pi(s, a) \nabla \pi_{\theta}(a | s)$$ 其中 $\eta(s)$ 为状态分布函数，可以使用 *likelihood ratio trick* 将其写成期望式
$$\begin{aligned}
\nabla J(\theta) & = \mathbb{E}_{s\sim\eta}\left[\sum_a \pi_\theta\left(a | s\right) q_\pi\left(s, a\right) \frac{\nabla \pi_\theta\left(a | s\right)}{\pi_\theta\left(a |s \right)}\right] \\
&= \mathbb{E}_{s\sim \eta,a\sim \pi_{\theta}}\left[q_\pi\left(s,a\right) \nabla \ln \pi_\theta\left(a | s\right)\right]
\end{aligned}$$

这里需要说明一下，此定理是对 $\bar{v},\bar{v}_{\pi},\bar{r}_{\pi}$ 作为目标函数 $J(\theta)$ 的统一描述，在不同的度量方式下，状态分布 $\eta(s)$ 也是不同的，且在折扣与非折扣的情况下，也会有所差异，我们会在之后的文章中详细说明，并在各种情况下证明该定理。

---

## *2. Monte Carlo Policy Gradient(蒙特卡罗策略梯度)*

有了策略梯度定理，我们可以开始设计梯度上升算法了，观察 $J(\theta)$ 的期望表达式

$$J(\theta) = \mathbb{E}_{S_{t} \sim \eta, A_{t} \sim \pi_\theta}\left[q_\pi\left(S_t, A_t\right) \nabla \ln \pi_\theta\left(A_t | S_t\right)\right]$$

我们可以用蒙特卡罗采用的方式来估计这个期望，另一方面由于

$$\mathbb{E}\left[G_t | S_t, A_t\right]=q_\pi\left(S_t, A_t\right)$$

可以用折扣回报 $G_{t}$ 作为 $q_\pi\left(S_t, A_t\right)$ 的一个无偏估计。


> **Method 3. Reinforce.** 算法使用蒙特卡罗采样得到轨迹 $\tau$，并使用 $G_{t}$ 作为 优化目标进行梯度上升
> $$\nabla J(\theta)  = \mathbb{E}_{\pi}\left[\sum_{t=0}^{T-1} G_{t} \cdot \nabla \ln \pi_{\theta}\left(A_{t} | S_{t}\right)\right]$$ 对于给定的步长参数 $\alpha$，算法流程如下：
> 
> 1. 初始化参数 $\theta$
> 2. 枚举 $k=0,1,\cdots$
>   - 在策略 $\pi_{\theta}$ 下生成一条轨迹 $$\left(S_0, A_0\right) \xrightarrow{R_1}\left(S_1, A_1\right) \xrightarrow{} \cdots \xrightarrow{} \left(S_{T-1}, A_{T-1}\right) \xrightarrow{R_{T}} \text{Terminal}$$
>   - 初始化 $G_{T} = 0$，逆序枚举 $t = T-1,\ldots,0$
>       * 计算折扣收益 $$G_{t} = \gamma G_{t +1} + R_{t}$$
>       * 更新参数 $$\theta \leftarrow \theta+\alpha G_{t} \nabla \ln \pi_{\theta}\left(A_{t} | S_{t}\right)$$

作为一种随机梯度方法，*Reinforce* 具有良好的理论收敛性，然而作为一种蒙特卡洛方法，*Reinforce* 具有较高的方差，收敛速度较慢。我们希望有一种方法可以减小 *Reinforce* 方法的方差。

我们把策略梯度定理扩展为下面的形式

$$\nabla J(\theta) = \sum_s \eta(s) \sum_a \left(q_\pi(s, a) - b(s)\right) \nabla \pi_{\theta}(a | s)$$

其中 *baseline(基线)* 函数 $b(s)$ 是一个关于状态 $s$ 的任意函数，这个式子的成立是比较显然的，因为

$$\sum_a b(s) \nabla \pi_{\theta}(a | s)=b(s) \nabla \sum_a \pi_{\theta}(a | s)=b(s) \nabla 1=0$$

那么问题就变成了选取一个合适的基线函数 $b(s)$ 尽可能的减小方差，一个自然的想法是取期望值 $v_{\pi}(s) = \mathbb{E}_{a\sim\pi}[q_{\pi}(s,a)]$，我们可以用参数化的 $\hat{v}\left(S_t, \mathbf{w}\right)$ 来估计它。

> **Method 4. Reinforce with Baseline.** 算法通过引入基线函数 $b(s)$ 对采样目标 $G_t$ 进行修正，从而提高梯度上升的稳定性
> $$\nabla J(\theta)  = \mathbb{E}_{\pi}\left[\sum_{t=0}^{T-1}(G_{t}-\hat{v}(S_{t};\mathbf{w})) \cdot \nabla \ln \pi_{\theta}\left(A_{t} | S_{t}\right)\right]$$ 对于给定的步长参数 $\alpha_{1},\alpha_{2}$，算法流程如下：
> 
> 1. 初始化参数 $\theta, \mathbf{w}$
> 2. 枚举 $k=0,1,\cdots$
>   - 在策略 $\pi_{\theta}$ 下生成一条轨迹 $$\left(S_0, A_0\right) \xrightarrow{R_1}\left(S_1, A_1\right) \xrightarrow{} \cdots \xrightarrow{} \left(S_{T-1}, A_{T-1}\right) \xrightarrow{R_{T}} \text{Terminal}$$
>   - 初始化 $G_{T} = 0$，逆序枚举 $t = T-1,\ldots,0$
>       * 计算折扣收益 $$G_{t} = \gamma G_{t +1} + R_{t}$$
>       * 记 $\delta = G_{t}-\hat{v}\left(S_t; \mathbf{w}\right)$，更新参数 $$\theta \leftarrow \theta+\alpha_{1} \delta \nabla \ln \pi_{\theta}\left(A_{t} | S_{t}\right)$$ $$\mathbf{w}\leftarrow\mathbf{w}+\alpha_{2} \delta \nabla \hat{v}\left(S_t; \mathbf{w}\right)$$

接下来我们要说明引入基线可以有效减小方差，即

$$\text{Var}_{\pi}\left[\sum_{t=0}^{T-1}(G_{t} - b(s_{t};\mathbf{w})) \nabla \ln \pi_{\theta}(A_{t} |S_{t})\right] < \text{Var}_{\pi}\left[\sum_{t=0}^{T-1}G_{t}  \nabla \ln \pi_{\theta}(A_{t}|S_{t})\right]$$

我们做如下的近似

$$\begin{aligned}
\operatorname{Var}\left(\sum_{t=0}^{T-1} \nabla \ln \pi_{\theta}\left(A_{t} | S_{t}\right)\left(G_{t}-b\left(S_{t}\right)\right)\right) & \stackrel{(i)}{\approx} \sum_{t=0}^{T-1} \mathbb{E}_{\pi}\left[\left(\nabla \ln \pi_{\theta}\left(A_{t} | S_{t}\right)\left(G_{t}-b\left(S_{t}\right)\right)\right)^{2}\right]\\
& \stackrel{(i i)}{\approx} \sum_{t=0}^{T-1} \mathbb{E}_{\pi}\left[\left(\nabla \ln \pi_{\theta}\left(A_{t} | S_{t}\right)\right)^{2}\right] \mathbb{E}_{\pi}\left[\left(G_{t}-b\left(S_{t}\right)\right)^{2}\right]
\end{aligned}$$

- $(i)$ 近似了随机变量和的方差为方差之和，这显然不是广泛成立的，但是做出这样的近似可以让我们利用 $$\operatorname{Var}(X)=\mathbb{E}\left[X^{2}\right]-(\mathbb{E}[X])^{2}$$ 消去 $\mathbb{E}[X]$ 的影响，因为我们已经证明了引入 $b(S_{t})$ 是无偏的。
- $(ii)$ 假设了 $\nabla_{\theta} \ln \pi_{\theta}\left(A_{t} | S_{t}\right)$ 和 $(G_{t}-b\left(S_{t}\right))$ 是相互独立的，这样的话我们就能把期望拆成因子相乘的形式。

这样的话，我们只需要考虑

$$\mathbb{E}_{\pi}\left[\left(G_{t}-b\left(s_{t}\right)\right)^{2}\right]$$

的影响，事实上在算法流程中，我们将这一项作为参数 $\mathbf{w}$ 的 *loss function(损失函数)* 进行优化，因此可以保证算法的方差在不断减小。

---

## *3. Actor-Critic Methods(演员-评论家算法)*

基于蒙特卡罗采样的策略梯度方法需要完整的采样轨迹才能计算梯度，我们考虑用 *TD* 算法中的 *bootstrap* 思想来扩展它。

> **Method 5. Actor-Critic.** 算法使用 $R_{t+1}+\gamma \hat{v}\left(S_{t+1}; \mathbf{w}\right)$ 作为 $G_{t}$ 的无偏估计
> $$\nabla J(\theta)=\mathbb{E}_{\pi}\left[\sum_{t=0}^{T-1} \left(R_{t+1}+\gamma \hat{v}\left(S_{t+1}, \mathbf{w}\right)-\hat{v}\left(S_t, \mathbf{w}\right)\right) \cdot \nabla \ln \pi_{\theta}\left(A_{t} | S_{t}\right)\right]$$ 对于给定的步长参数 $\alpha_{1},\alpha_{2}$，算法流程如下：
> 
> 1. 初始化参数 $\theta, \mathbf{w}$ 的值
> 2. 枚举 $k=0,1,\cdots$
>   - 随机选取初始状态 $S_{0}$
>   - 枚举时刻 $t = 0,\ldots,T-1$
>       * 在策略 $\pi_{\theta}(S_{t})$ 下选取行动 $A_{t}$，得到 $R_{t+1},S_{t+1}$
>       * 计算 *TD* 误差 $$\delta = R_{t+1}+\gamma \hat{v}\left(S_{t+1}; \mathbf{w}\right)-\hat{v}(S_{t}; \mathbf{w})$$
>       * 更新参数 $$\theta \leftarrow \theta+\alpha_{1} \delta \nabla \ln \pi_{\theta}\left(A_{t} | S_{t}\right)$$ $$\mathbf{w}\leftarrow\mathbf{w}+\alpha_{2} \delta \nabla \hat{v}\left(S_t; \mathbf{w}\right)$$

更一般的，我们可以用上一章介绍的 *n-step bootstrap* 方法来扩展它。

---

## *Appendix: Proof of Cesàro Mean*

> **Theorem 6. Cesàro Mean(切萨罗均值).** 设序列 $\{a_{n}\}$ 收敛于 $a$，则 
> $$\lim _{n \rightarrow \infty} \frac{1}{n}\sum_{k=1}^{n}a_{k} = a$$

证明：注意到

$$\left|\left(\frac{1}{n} \sum_{k=1}^n a_k\right)-a\right|=\frac{1}{n}\left|\sum_{k=1}^n\left(a_k-a\right)\right| \leq \frac{1}{n} \sum_{k=1}^n\left|a_k-a\right|$$

由于序列 $a_{n}\rightarrow a$，我们任取 $\epsilon >0$，存在 $\ell$ 使得当 $k> \ell$ 时

$$|a_{k}-a| < \frac{\epsilon}{2}$$

我们将上面的和式拆成两部分讨论

$$\frac{1}{n} \sum_{k=1}^n\left|a_k-a\right| = \frac{\sum_{k=1}^{\ell}\left|a_k-a\right|}{n}+\frac{\sum_{k=\ell+1}^n\left|a_k-a\right|}{n} $$

对于右边的部分，有

$$\frac{1}{n} \sum_{k=\ell+1}^{n}\left|a_k-a\right|< \frac{\epsilon}{2}\cdot \frac{n-\ell}{n}<\frac{\epsilon}{2}$$

对于左边的部分和 $n$ 无关，而 $\ell$ 又是固定的，我们可以选择一个足够大的 $N$，使得当 $n > N$ 时，有

$$\frac{1}{n}\sum_{k=1}^{\ell}|a_{k}-a| < \frac{\epsilon}{2}$$

组合起来，当 $n>N$ 时有

$$\frac{1}{n} \sum_{k=1}^n\left|a_k-a\right| < \epsilon$$

证明完毕
