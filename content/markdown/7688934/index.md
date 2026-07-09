---
type: markdown
title: 强化学习重学系列(4) Monte Carlo Methods
slug: "7688934"
order: 14
date: 2024-06-03
updatedAt: 2026-07-01 01:26:27
tags:
  - 强化学习
published: true
category: machine-learning
---

## *1. Monte Carlo Control(蒙特卡罗控制)*

不同于之前的动态规划方法，我们不再假设已知环境的状态转移方程，而是从智能体与真实环境不断交互获得的历史轨迹入手，从中学习历史经验进行学习。

首先我们考虑在给定的策略 $\pi$ 下，如何求解状态价值函数

$$v_\pi(s)=\mathbb{E}_\pi\left[G_t \mid S_t=s\right]=\mathbb{E}_\pi\left[\sum_{k=0}^{\infty} \gamma^k R_{t+k+1} \mid S_t=s\right]$$

还记得在最开始的多臂老虎机问题中，我们的方法是将各个手臂的历史奖励求均值，作为该手臂的价值，随着更多的奖励被观测到，这个均值将会收敛于它的期望回报。

这就是 *Monte Carlo method(蒙特卡罗方法)* 的基本思想，我们考虑把它应用于马尔科夫模型。

首先我们令智能体执行策略 $\pi$ 下与环境交互获得一系列的轨迹，若状态 $s$ 出现在某条轨迹中时，我们称该轨迹对 $s$ 进行了一次 *visit(访问)*，当然，一条轨迹可能会对状态 $s$ 进行了多次访问，我们把距离结束状态最近的一次访问称为 *first visit(初次访问)*.

我们有两种蒙特卡罗方法

- *First-visit MC*：只计算所有轨迹中对状态 $s$ 的初次访问的折扣收益的均值，作为期望收益。
- *Every-visit MC*：计算所有轨迹中对状态 $s$ 的每一次访问的折扣收益求均值。

两种方法大体上是类似的，只是在公式细节上有所不同，我们主要关注第一种方法。

> **Method 1. First-visit MC Prediction(初次访问蒙特卡罗预测).** 对于给定的策略 $\pi$，算法流程如下：
> 
> 1. 对于所有状态 $s\in\mathcal{S}$，初始化折扣收益列表 $Returns(s) = \text{Empty List}$
> 2. 枚举 $k = 0, 1,\cdots$
>   - 在策略 $\pi$ 下生成一条轨迹 $$\left(S_0, A_0\right) \xrightarrow{R_1}\left(S_1, A_1\right) \xrightarrow{} \cdots \xrightarrow{} \left(S_{T-1}, A_{T-1}\right) \xrightarrow{R_{T}} \text{Terminal}$$
>   - 初始化 $G_{T} = 0$
>   - 逆序枚举状态 $t = T-1,T-2,\cdots, 0$，若 $S_{t}$ 为首次访问
>       - 计算折扣收益 $G_{t} = \gamma G_{t+1} + R_{t+1}$
>       - 将折扣收益 $G_{t}$ 加入到其列表 $Returns(S_{t})$ 中
>       - 估计状态价值函数 $v_{\pi}(s) = \operatorname{average}(Returns(s))$

由于每条轨迹中计算的状态 $s$ 的折扣收益，都是一个对 $v_{\pi}(s)$ 的独立同分布的有限方差估计，所以算法最终会收敛于 $v_{\pi}(s)$.

接下来考虑策略提升，在 *model-based* 的情况下，我们完成价值函数估计后，就可以使用

$$\begin{aligned}
\pi^{\prime}(s) & =\underset{a}{\operatorname{argmax}} \sum_{s^{\prime}, r} p\left(s^{\prime}, r \mid s, a\right)\left[r+\gamma v_\pi\left(s^{\prime}\right)\right]
\end{aligned}$$

选择最优行动进行策略提升，但是现在我们是 *model-free* 的环境，并不知道状态转移函数 $p$，因此相比于状态价值的评估，行动价值函数 $q_{\pi}(s,a)$ 的评估更为重要。

根据策略提升定理，我们只需要选择

$$\pi^{\prime}(s)=\underset{a}{\operatorname{argmax}} q_\pi(s, a)$$

进行迭代更新即可。但是选择 $q_{\pi}(s,a)$ 会引入一个问题，就是如何保证 *maintaining exploration(持续探索)*，即所有的 $(s,a)$ 数对都会被遍历到。

我们先做出一个 *exploring starts* 的假设，即假设从我们选定的 $(S_{0},A_{0})$ 开始，所有的 $(s,a)$ 都会被智能体尝试过，从而得到一个较为简化的控制算法

> **Method 2. Monte Carlo Exploring Starts.** 在 *exploring starts* 假设下，寻找最优策略的算法流程如下：
>
> 1. 初始化 $\pi(s), Q(s,a)$ 以及折扣收益列表 $Returns(s,a) = \text{Empty List}$
> 2. 枚举 $k = 0, 1,\cdots$
>   - 在策略 $\pi$ 下，从随机选取的 $(S_{0},A_{0})$ 开始生成一条轨迹 $$\left(S_0, A_0\right) \xrightarrow{R_1}\left(S_1, A_1\right) \xrightarrow{} \cdots \xrightarrow{} \left(S_{T-1}, A_{T-1}\right) \xrightarrow{R_{T}} \text{Terminal}$$
>   - 初始化 $G_{T} = 0$
>   - 逆序枚举状态 $t = T-1,T-2,\cdots, 0$，若 $(S_{t},A_{t})$ 为首次访问
>       - 计算折扣收益 $G_{t} = \gamma G_{t+1} + R_{t+1}$
>       - 将折扣收益 $G_{t}$ 加入到其列表 $Returns(S_{t},A_{t})$ 中
>       - 估计行动化值函数 $Q\left(S_t, A_t\right) = \operatorname{average}\left(\operatorname{Returns}\left(S_t, A_t\right)\right)$
>       - 进行策略提升 $\pi\left(S_t\right) = \arg \max _a Q\left(S_t, a\right)$ 

---

## *2. Monte Carlo Control without Exploring Starts*

在之前的算法中，我们做了一个强力的假设 *exploring starts*，即智能体从我们选定的 $(S_{0},A_{0})$ 出发，与环境交互得到的轨迹中，会尝试所有可能的 $(s,a)$ 数对，现在尝试去掉这个假设。

我们有两类方法来解决这个问题，一种是 *on policy(在线策略)* 的，另一种则是 *off policy(离线策略)* 的。

在线策略使用同一个策略 $\pi$ 进行价值评估和策略提升，而离线策略则是使用不同的策略，之前我们介绍的方法都是在线策略的。

还记得我们在多臂老虎机中介绍的 *$\varepsilon$-greedy* 方法，即大多数时候选择贪心策略，而有 $\varepsilon$ 的概率选择随机策略，即

$$\pi(a | s)= \begin{cases} 1-\epsilon + \frac{\epsilon}{|\mathcal{A}|}, & \text { if } a=\operatorname{argmax}_{a^{\prime}} q(s, a^{\prime}) \\ \frac{\epsilon}{|\mathcal{A}|}, & \text { otherwise }\end{cases}$$

我们将它应用于在线策略算法，得到下面的算法

> **Method 3. On-policy MC Control(在线蒙特卡罗控制).** 对于 $\epsilon>0$，使用 *$\varepsilon$-greedy* 寻找最优策略的算法流程如下：
>
> 1. 初始化 $\pi(s), Q(s,a)$ 以及折扣收益列表 $Returns(s,a) = \text{Empty List}$
> 2. 枚举 $k = 0, 1,\cdots$
>   - 在策略 $\pi$ 下，从随机选取的 $(S_{0},A_{0})$ 开始生成一条轨迹 $$\left(S_0, A_0\right) \xrightarrow{R_1}\left(S_1, A_1\right) \xrightarrow{} \cdots \xrightarrow{} \left(S_{T-1}, A_{T-1}\right) \xrightarrow{R_{T}} \text{Terminal}$$
>   - 初始化 $G_{T} = 0$
>   - 逆序枚举状态 $t = T-1,T-2,\cdots, 0$，若 $(S_{t},A_{t})$ 为首次访问
>       - 计算折扣收益 $G_{t} = \gamma G_{t+1} + R_{t+1}$
>       - 将折扣收益 $G_{t}$ 加入到其列表 $Returns(S_{t},A_{t})$ 中
>       - 估计行动化值函数 $Q\left(S_t, A_t\right) = \operatorname{average}\left(\operatorname{Returns}\left(S_t, A_t\right)\right)$
>       - 找到最优行动 $a^* = \arg \max _a Q\left(S_t, a\right)$
>       - 进行策略提升 $$\pi\left(a | S_t\right) \leftarrow \begin{cases}1-\varepsilon+\frac{\epsilon}{|\mathcal{A}(S_{t})|} & \text { if } a=a^* \\ \frac{\epsilon}{|\mathcal{A}(S_{t})|} & \text { if } a \neq a^*\end{cases}$$

接下来我们需要证明 *$\varepsilon$-greedy* 方法选择出的新策略是对原策略的一个提升，首先写出

$$\begin{aligned}
q_\pi\left(s, \pi^{\prime}(s)\right) & =\sum_a \pi^{\prime}(a | s) q_\pi(s, a) \\
& =\frac{\varepsilon}{|\mathcal{A}(s)|} \sum_a q_\pi(s, a)+(1-\varepsilon) \max _a q_\pi(s, a) \\
&\geq \frac{\varepsilon}{|\mathcal{A}(s)|} \sum_a q_\pi(s, a)+(1-\varepsilon) \sum_a \frac{\pi(a \mid s)-\frac{\varepsilon}{|\mathcal{A}(s)|}}{1-\varepsilon} q_\pi(s, a) \\
& =\frac{\varepsilon}{|\mathcal{A}(s)|} \sum_a q_\pi(s, a)-\frac{\varepsilon}{|\mathcal{A}(s)|} \sum_a q_\pi(s, a)+\sum_a \pi(a \mid s) q_\pi(s, a) \\
& =v_\pi(s)
\end{aligned}$$

这里我们使用了一个魔法

$$\max _a q_\pi(s, a) \geq \sum_a \frac{\pi(a | s)-\frac{\varepsilon}{|\mathcal{A}(s)|}}{1-\varepsilon} q_\pi(s, a)$$

仔细观察右边引入的项，它实际上是一个非负加权平均，所以它必然不大于 $q_{\pi}$ 的最大值。

因此，根据策略提升定理，*$\varepsilon$-greedy* 方法得到的新策略确实是一个提升，算法最终会收敛于最优策略。

---

## *3. Off-policy Monte Carlo Control(离线蒙特卡罗控制)*

正如我们在多臂老虎机问题中提到的，所有的强化学习算法都需要考虑 *exploration* 与 *exploitation* 的平衡，即智能体既要通过最有行动学习价值函数，又要充分探索其它行动，如何做到这一点呢？

上一节中提到的策略方法实际上是进行了一种妥协，它使用的 *$\varepsilon$-greedy* 策略实际上是放弃了最优策略，而是选择一个可以保持探索的接近最优策略的策略进行价值学习。

更为自然的想法是直接使用两个不同的策略，一个用来最优策略，称为 *target policy*，另一个则是用来探索行动，称为 *behavior policy(行为策略)*，这样的学习方式我们称为离线学习。

离线策略方法更加强大且更具泛化性，但是拥有更大的方差，收敛速度要慢一些。

我们使用目标策略 $\pi$ 和行为策略 $b$，我们要求在 $\pi$ 下可行的行动在 $b$ 下也是可行的，即

$$\pi(a|s) >0 \Rightarrow b(a|s) > 0$$

首先考虑价值估计的问题，由于我们从策略 $b$ 采样生成轨迹，因此获得的期望回报

$$\mathbb{E}\left[G_t \mid S_t=s\right]=v_b(s)$$

而用于学习的目标策略 $\pi$ 要求从 $v_{\pi}(s)$ 中选择最优行动，因此我们需要 *importance sampling(重要性采样)* 来修正不同策略下期望回报的偏差。

考虑在初始状态 $S_{t}$ 下采用策略 $\pi$ 得到轨迹 $(S_{t},A_t)\rightarrow (S_{t+1}, A_{t+1})\rightarrow \cdots \rightarrow S_T$ 的概率为

$$\mathbb{P}(A_t, S_{t+1}, A_{t+1}, \ldots, S_T \mid S_t, A_{t: T-1} \sim \pi) = \prod_{k=t}^{T-1} \pi\left(A_k | S_k\right) p\left(S_{k+1} | S_k, A_k\right)$$

因此我们的 *importance sampling ratio(重要性采样率)* 为

$$\rho_{t: T-1} = \frac{\prod_{k=t}^{T-1} \pi\left(A_k | S_k\right) p\left(S_{k+1} | S_k, A_k\right)}{\prod_{k=t}^{T-1} b\left(A_k | S_k\right) p\left(S_{k+1} | S_k, A_k\right)}=\prod_{k=t}^{T-1} \frac{\pi\left(A_k | S_k\right)}{b\left(A_k | S_k\right)}$$

而修正后的期望回报

$$\mathbb{E}\left[\rho_{t: T-1} G_t \mid S_t=s\right]=v_\pi(s)$$

所以，我们只需要对 $b$ 策略下采样得到的 $G_{t}$ 乘上一个缩放因子 $\rho_{t: T-1}$，然后对其求均值就能得到 $\pi$ 策略下的价值函数。

为了书写方便，我们将采样得到的轨迹合并在一起，例如第一条轨迹在 $t = 100$ 时结束，那么我们令第二条轨迹从 $t=101$ 开始。

定义 $\mathcal{T}(s)$ 表示这些轨迹中首次访问状态 $s$ 的时刻集合，$T(t)$ 表示时刻 $t$ 对应的轨迹的结束时刻，$G_{t}$ 表示时刻 $t\sim T(t)$ 的折扣收益，那么可以写出

$$v_{\pi}(s) = \frac{\sum_{t \in \mathcal{T}(s)} \rho_{t: T(t)-1} G_t}{|\mathcal{T}(s)|} $$

这里我们采用的是与在线算法相同的直接求均值方法，我们把它叫做 *ordinary importance sampling(平凡重要性采样)*，与之相对的是 *weighted importance sampling(加权重要性采样)*

$$v_{\pi}(s) = \frac{\sum_{t \in \mathcal{T}(s)} \rho_{t: T(t)-1} G_t}{\sum_{t \in \mathcal{T}(s)} \rho_{t: T(t)-1}}$$

这两种方法实际上是关于 *bias(偏差)* 和 *variance(方差)* 的 *trade-off*，平凡采样的结果是一个无偏估计，但如果采样率趋近于无穷，那么方差将是无界的。而加权采样虽然是一个有偏估计，但是它限制了每个回报 $G_{t}$ 的权重最大为 $1$，即使采样率趋近于无穷，方差依然是有界的，且偏差会随着采样数量的增加而逐渐消失。

在实践中，由于加权采样的方差更小，我们更偏向于使用它。但是也不能完全放弃平凡采样，因为它更容易扩展到之后要介绍的近似方法。

结合我们在多臂老虎机问题中提到的增量平均方法，以加权采样为例，假设我们在某状态 $s$ 下，有折扣收益序列 $G_1, G_2, \ldots, G_{n-1}$，记权重 $W_i=\rho_{t_i: T\left(t_i\right)-1}$，那么我们要估计的价值函数

$$V_n = \frac{\sum_{k=1}^{n-1} W_k G_k}{\sum_{k=1}^{n-1} W_k}$$

对于下一个收益 $G_{n}$，记 $C_{n} = \sum_{k=1}^{n-1}W_{k}$，有

$$\begin{aligned}V_{n+1} 
&= \frac{W_{n}G_{n} + \sum_{k=1}^{n-1} W_k G_k}{\sum_{k=1}^{n-1} W_k}\cdot \frac{\sum_{k=1}^{n-1} W_k}{\sum_{k=1}^{n} W_k}\\
&= \frac{W_{n}G_{n}}{C_{n+1}} + V_{n} \frac{C_{n}}{C_{n+1}}\\
&= \frac{W_{n}}{C_{n+1}}G_{n} +\left(1 - \frac{W_{n}}{C_{n+1}}\right) V_{n} \\
&= V_{n} + \frac{W_n}{C_{n+1}}\left(G_n-V_n\right)
\end{aligned}$$

所以根据递推关系

$$\begin{aligned}
& C_{n+1} = C_n+W_{n} \\
& V_{n+1} = V_n+\frac{W_n}{C_{n+1}}\left(G_n-V_n\right)
\end{aligned}$$

我们可以得到下面的离线策略评估算法

> **Method 4. Off-policy MC Prediction(离线蒙特卡罗预测).** 对于给定的策略 $\pi$，使用离线方法预测价值函数的算法流程如下
>
> 1. 对于 $s\in\mathcal{S}, a\in\mathcal{A}(s)$，初始化 $Q(s,a)$ 以及权重 $C(s,a) = 0$
> 2. 枚举 $k = 0, 1,\cdots$
>   - 选取一个行为策略 $b$，例如 *$\varepsilon$-greedy* 策略
>   - 在策略 $b$ 下生成一条轨迹 $$\left(S_0, A_0\right) \xrightarrow{R_1}\left(S_1, A_1\right) \xrightarrow{} \cdots \xrightarrow{} \left(S_{T-1}, A_{T-1}\right) \xrightarrow{R_{T}} \text{Terminal}$$
>   - 初始化 $G_{T} = 0, W_{T}=1$
>   - 逆序枚举状态 $t = T-1,T-2,\cdots, 0$，若 $(S_{t},A_{t})$ 为首次访问
>       - 计算折扣收益 $G_{t} = \gamma G_{t+1} + R_{t+1}$
>       - 更新行动价值函数 $$\begin{aligned}
& C\left(S_t, A_t\right) = C\left(S_t, A_t\right)+W_{t+1} \\
& Q\left(S_t, A_t\right) = Q\left(S_t, A_t\right)+\frac{W_{t+1}}{C\left(S_t, A_t\right)}\left[G_{t}-Q\left(S_t, A_t\right)\right]
\end{aligned}$$
>       - 更新重要性采样率 $$W_{t} =  \frac{\pi\left(A_t | S_t\right)}{b\left(A_t | S_t\right)}W_{t+1}$$ 

和在线算法一样，我们选择

$$\pi^{\prime}(s)=\underset{a}{\operatorname{argmax}} q_\pi(s, a)$$

进行策略提升，就可以得到离线控制算法

> **Method 5. Off-policy MC Control(离线蒙特卡罗控制).** 离线蒙特卡罗控制算法的流程如下
>
> 1. 对于 $s\in\mathcal{S}, a\in\mathcal{A}(s)$，初始化 $Q(s,a),\pi(s)$ 以及权重 $C(s,a) = 0$
> 2. 枚举 $k = 0, 1,\cdots$
>   - 选取一个行为策略 $b$，例如 *$\varepsilon$-greedy* 策略
>   - 在策略 $b$ 下生成一条轨迹 $$\left(S_0, A_0\right) \xrightarrow{R_1}\left(S_1, A_1\right) \xrightarrow{} \cdots \xrightarrow{} \left(S_{T-1}, A_{T-1}\right) \xrightarrow{R_{T}} \text{Terminal}$$
>   - 初始化 $G_{T} = 0, W_{T}=1$
>   - 逆序枚举状态 $t = T-1,T-2,\cdots, 0$，若 $(S_{t},A_{t})$ 为首次访问
>       - 计算折扣收益 $G_{t} = \gamma G_{t+1} + R_{t+1}$
>       - 更新行动价值函数 $$\begin{aligned}
& C\left(S_t, A_t\right) = C\left(S_t, A_t\right)+W_{t+1} \\
& Q\left(S_t, A_t\right) = Q\left(S_t, A_t\right)+\frac{W_{t+1}}{C\left(S_t, A_t\right)}\left[G_{t}-Q\left(S_t, A_t\right)\right]
\end{aligned}$$
>       - 进行策略提升 $$\pi\left(S_t\right) \leftarrow \arg \max _a Q\left(S_t, a\right)$$
>       - 更新重要性采样率 $$W_{t} =  \frac{1}{b\left(A_t | S_t\right)}W_{t+1}$$ 

---

## *4. Discounting-aware Importance Sampling(折扣感知的重要性采样)*

在之前的离线算法中，我们考虑的都是对折扣 $G_{t}$ 进行重要性采样，得到

$$v_\pi(s) = \mathbb{E}\left[\rho_{t: T-1} G_t \mid S_t=s\right]$$

我们考虑 $G_{t}$ 的表达式

$$G_t = R_{t+1}+\gamma R_{t+2}+\gamma^2 R_{t+3}+\cdots+\gamma^{T-t-1} R_T$$

现在引入一个非常重要的思想 *discounting-aware(折扣感知)*，当轨迹较长且 $\gamma \ll 1$ 时，$t = 0$ 时刻的回报就是 $R_{1}$，对应的重要性采样率为

$$\rho_{0:T-1} = \frac{\pi\left(A_0 | S_0\right)}{b\left(A_0 | S_0\right)} \frac{\pi\left(A_1 | S_1\right)}{b\left(A_1 | S_1\right)} \cdots \frac{\pi\left(A_{T-1} | S_{T-1}\right)}{b\left(A_{T-1} | S_{T-1}\right)}$$

其中真正起作用的只有第一项，这是因为当我们采样出 $R_{1}$ 后，回报就确定了，不需要继续采样后面的轨迹了。事实上后面那些项的期望值是 $1$，但是引入了极大甚至无界的方差。

我们考虑规避这个方差，不妨将 $G_{t}$ 展开为

$$\begin{aligned}
G_t = & R_{t+1}+\gamma R_{t+2}+\gamma^2 R_{t+3}+\cdots+\gamma^{T-t-1} R_T \\
= & (1-\gamma) R_{t+1} \\
& +(1-\gamma) \gamma\left(R_{t+1}+R_{t+2}\right) \\
& +(1-\gamma) \gamma^2\left(R_{t+1}+R_{t+2}+R_{t+3}\right) \\
& \cdots \\
& +(1-\gamma) \gamma^{T-t-2}\left(R_{t+1}+R_{t+2}+\cdots+R_{T-1}\right) \\
& +\gamma^{T-t-1}\left(R_{t+1}+R_{t+2}+\cdots+R_T\right)
\end{aligned}$$

这里的展开可以理解为每一步有 $1 - \gamma$ 的概率终止拿到这一时刻之前的所有收益，有 $\gamma$ 的概率继续走下去，直到达到 $T$ 时刻为止。

我们记 *flat partial returns(扁平化部分回报)* 

$$\bar{G}_{t: h} = R_{t+1}+R_{t+2}+\cdots+R_h, \quad 0 \leq t<h \leq T,$$

那么可以写出

$$G_t = (1-\gamma) \sum_{h=t+1}^{T-1} \gamma^{h-t-1} \bar{G}_{t: h}+\gamma^{T-t-1} \bar{G}_{t: T} .$$

根据之前的讨论，$\bar{G}_{t: h}$ 的期望仅与 $R_{t},\cdots,R_{h}$ 及其采样率 $\rho_{t: h-1}$ 有关，因此

$$v_{\pi}(s) = \frac{\sum_{t \in \mathcal{T}(s)}\left((1-\gamma) \sum_{h=t+1}^{T(t)-1} \gamma^{h-t-1} \rho_{t: h-1} \bar{G}_{t: h}+\gamma^{T(t)-t-1} \rho_{t: T(t)-1} \bar{G}_{t: T(t)}\right)}{|\mathcal{T}(s)|}$$

也可以写成加权采样的形式

$$v_{\pi}(s) = \frac{\sum_{t \in \mathcal{T}(s)}\left((1-\gamma) \sum_{h=t+1}^{T(t)-1} \gamma^{h-t-1} \rho_{t: h-1} \bar{G}_{t: h}+\gamma^{T(t)-t-1} \rho_{t: T(t)-1} \bar{G}_{t: T(t)}\right)}{\sum_{t \in \mathcal{T}(s)}\left((1-\gamma) \sum_{h=t+1}^{T(t)-1} \gamma^{h-t-1} \rho_{t: h-1}+\gamma^{T(t)-t-1} \rho_{t: T(t)-1}\right)}$$

我们看到当 $\gamma \rightarrow 1$ 时，需要采样的轨迹趋近于完整的轨迹，此时折扣感知的重要性采样逐渐趋近于之前的平凡算法。

---

## *5. Per-decision Importance Sampling(每决策重要性采样)*

我们还有另一种方法来减小方差，考虑

$$\begin{aligned}
\rho_{t: T-1} G_t & =\rho_{t: T-1}\left(R_{t+1}+\gamma R_{t+2}+\cdots+\gamma^{T-t-1} R_T\right) \\
& =\rho_{t: T-1} R_{t+1}+\gamma \rho_{t: T-1} R_{t+2}+\cdots+\gamma^{T-t-1} \rho_{t: T-1} R_T
\end{aligned}$$

中的项，我们看到奖励 $R_{t+1}$ 的贡献

$$\rho_{t: T-1} R_{t+1}=\frac{\pi\left(A_t | S_t\right)}{b\left(A_t | S_t\right)} \frac{\pi\left(A_{t+1} | S_{t+1}\right)}{b\left(A_{t+1} | S_{t+1}\right)} \frac{\pi\left(A_{t+2} | S_{t+2}\right)}{b\left(A_{t+2} | S_{t+2}\right)} \cdots \frac{\pi\left(A_{T-1} | S_{T-1}\right)}{b\left(A_{T-1} | S_{T-1}\right)} R_{t+1}$$

其中只有第一项与奖励是相关的，后面的项与 $R_{t+1}$ 是相互独立的，且

$$\mathbb{E}\left[\frac{\pi\left(A_k | S_k\right)}{b\left(A_k | S_k\right)}\right]=\sum_a b\left(a | S_k\right) \frac{\pi\left(a | S_k\right)}{b\left(a | S_k\right)}=\sum_a \pi\left(a | S_k\right)=1$$

因此我们有

$$\mathbb{E}\left[\rho_{t: T-1} R_{t+1}\right]=\mathbb{E}\left[\rho_{t: t} R_{t+1}\right]$$

进一步的，有

$$\mathbb{E}\left[\rho_{t: T-1} R_{t+k}\right]=\mathbb{E}\left[\rho_{t: t+k-1} R_{t+k}\right]$$

因此我们的期望回报可以写成

$$\begin{aligned} \tilde{G}_t 
&= \mathbb{E}[\rho_{t: T-1} G_t] = \mathbb{E}\left[\rho_{t: T-1} \sum_{k=t+1}^{T} \gamma^{k-t-1}R_{k}\right] \\
&=  \sum_{k=t+1}^{T} \gamma^{k-t-1} \mathbb{E}\left[\rho_{t: k-1}R_{k}\right] \\
\end{aligned}$$

使用平凡采样，得到相应的价值函数

$$v_{\pi}(s) = \frac{\sum_{t \in \mathcal{T}(s)} \tilde{G}_t}{|\mathcal{T}(s)|}$$

我们把这样的采样方式称为 *per-decision importance sampling(每决策重要性采样)*.
