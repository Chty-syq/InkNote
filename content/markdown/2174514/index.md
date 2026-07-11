---
type: markdown
title: 强化学习重学系列(9) N-step Bootstrapping
slug: "2174514"
order: 10
date: 2025-02-10
updatedAt: 2026-07-08 23:58:34
tags:
  - 强化学习
published: true
category: machine-learning
---

## *1. N-Step TD Prediction(多步TD预测)*

回忆我们之前讲到的 *MC* 和 *TD* 方法，*MC* 方法使用完整的采样轨迹来更新价值函数，采样结束时才能进行更新，其收敛速度慢且拥有较大的方差。而 *TD* 方法则是采样下一时刻的状态来更新当前状态的价值函数，这样做减小了方差却引入了偏差。那么有么有一种介于两者之间的方法来平衡偏差与方差呢？

答案是肯定的，我们只需要进行 $n$ 步采样，使用后面 $n$ 个时刻的价值函数来更新当前时刻的状态即可。我们把这样的方法称为 *n-step TD*.

<center>![](/content-images/external/35c08b8f7293f37a4a89e03a8300bac1.jpg)</center>

假设我们从状态 $S_{t}$ 出发采样了一条轨迹 $S_t, R_{t+1}, S_{t+1}, R_{t+2}, \ldots, R_T, S_T$，使用 *MC* 方法更新 $v_{\pi}(S_{t})$ 的式子是

$$v_\pi(s)=\mathbb{E}_\pi\left[G_t | S_t=s\right]$$

我们的做法是对所有采样轨迹的 $G_{t}$ 求均值来估计这个期望，当我们更新第 $n$ 条轨迹的贡献 $G_{t}^{(n)}$ 时

$$\begin{aligned}v^{(n)}_\pi(s) 
&= \frac{1}{n}\sum_{i=1}^{n} G_{t}^{(i)} \\
&= (1-\frac{1}{n})\sum_{i=1}^{n-1} G_{t}^{(i)} + \frac{1}{n}G_{t}^{(n)}\\
&= v^{(n-1)}_\pi(s) + \frac{1}{n}\left(G_{t}^{(n)} - v^{(n-1)}_\pi(s)\right)
\end{aligned}$$

我们用步长参数 $\alpha$ 替代式中的 $\frac{1}{n}$ 得到迭代式

$$v_\pi(s) \leftarrow v_\pi(s) + \alpha(G_{t} - v_\pi(s))$$

因此 $G_{t}$ 就是本次更新的 *target(目标)*，而在 $TD$ 方法中，则是仅采样下一状态，利用 $R_{t+1}+\gamma v_\pi\left(S_{t+1}\right)$ 来估计 $G_{t}$ 进行更新

$$v_\pi\left(S_t\right) \leftarrow v_\pi\left(S_t\right)+\alpha\left(R_{t+1}+\gamma v_\pi\left(S_{t+1}\right)-v_\pi\left(S_t\right)\right)$$

我们把这种管中窥豹的方法称为 *bootstrap(自举)*，很自然的，我们可以想到采样后 $n$ 个状态来估计 $G_{t}$ 的方法

$$G_{t,n} = R_{t+1}+\gamma R_{t+2}+\cdots+\gamma^{n-1} R_{t+n}+\gamma^n v_{\pi}\left(S_{t+n}\right)$$

这里需要注意边界情况，当 $t+n\geq T$ 时算法退化为 *MC*，此时可以计算完整的 $G_{t}$，因此

$$G_{t,n} = \begin{cases}
\gamma^n v_\pi\left(S_{t+n}\right) + \sum_{i=1}^{n} \gamma^{i-1}R_{t+i}, & \text{if } t+n< T\\
G_{t},& \text{if } t+n\geq T
\end{cases}$$

而价值函数的更新则是

$$v_\pi(s) \leftarrow v_\pi(s)+\alpha\left(G_{t,n}-v_\pi(s)\right)$$

考虑更新 $G_{t,n}$ 时的状态依赖关系，如图所示

<center>![title](/content-images/external/cb4aacb8a11d22bcfcdb5b811324d6c0.png)</center>

我们看到在 $t$ 时刻，想要计算 $G_{t,n}$ 需要知道 $t+1,t+2,\cdots, t+n$ 时刻的状态和奖励，反过来说，当我们采样完成 $t$ 时刻后，可以计算 $G_{t-n+1,n}$ 的值进行更新。

> **Method 1. N-Step TD Prediction.** 对于给定的策略 $\pi$，步长参数 $\alpha \in (0,1]$ 和正整数 $n$，算法流程如下：
>
> 1. 对于状态 $s\in\mathcal{S}$，初始化 $v_{\pi}(s)$.
> 2. 枚举轨迹标号 $k = 0, 1,\cdots$
>   - 随机选取初始状态 $S_{0}$
>   - 枚举时刻 $t = 0, 1, \cdots$
>       - 在策略 $\pi(S_{t})$ 下选取行动 $A_{t}$，得到 $R_{t+1},S_{t+1}$
>       - 记 $\tau = t-n+1$，累加即时回报 $$G_{\tau,n} \leftarrow \sum_{i=1}^{n} \gamma^{i-1} R_{\tau+i}$$
>       - 若 $S_{t+1}$ 不为终止状态，统计期望回报 $$G_{\tau,n} \leftarrow G_{\tau,n} + \gamma^n v_{\pi}\left(S_{\tau+n}\right)$$
>       - 更新价值函数 $$v_{\pi}\left(S_t\right) \leftarrow
v_{\pi}\left(S_t\right)+\alpha\left(G_{\tau,n}-v_{\pi}\left(S_t\right)\right)$$
>       - 若达到结束状态则退出循环，继续执行下一条轨迹

---

## *2. N-Step TD Control(多步TD控制)*

接下来考虑控制问题，我们尝试将 *Sarsa* 算法进行 *n-step bootstrapping*，如图所示

<center>![](/content-images/external/e2ea8e1a428a89afc682ea2c08bd9e91.jpg)</center>

我们之前写过 *Sarsa(0)* 的迭代目标 $$G_{t} = R_{t+1}+\gamma q_\pi\left(S_{t+1}, A_{t+1}\right)$$

结合上图可以写出 *n-step Sarsa* 的迭代目标

$$G_{t,n} = \gamma^n q_\pi\left(S_{t+n},A_{t+n}\right)+\sum_{i=1}^n \gamma^{i-1} R_{t+i}$$

且当 $t+n\geq T$ 时，$G_{t,n}=G_{t}$，迭代方程为

$$q_{\pi}\left(S_t, A_t\right) \leftarrow q_{\pi}\left(S_t, A_t\right)+\alpha\left[G_{t,n}- q_{\pi}\left(S_t, A_t\right)\right]$$

同样的，$t$ 时刻的 $G_{t,n}$ 依赖于 $t+1,t+2,\cdots, t+n$ 时刻的状态、奖励和行动，也就是说当我们采样完成 $t$ 时刻后，可以计算 $G_{t-n+1,n}$ 的值进行更新。

> **Method 2. N-step Sarsa.** 对于给定的 $n,\epsilon$ 和 $\alpha \in (0,1]$，*n-step Sarsa* 的算法流程如下
>
> 1. 对于 $s\in\mathcal{S},a\in\mathcal{A(s)}$，初始化 $Q(s,a), \pi(a|s)$
> 2. 枚举轨迹标号 $k = 0, 1,\cdots$
>   - 随机选取初始状态 $S_{0}$，在策略 $\pi(S_{0})$ 下选择行动 $A_{0}$
>   - 枚举时刻 $t = 0, 1, \cdots$
>       - 执行行动 $A_{t}$ 得到 $R_{t+1},S_{t+1}$
>       - 记 $\tau = t-n+1$，累加即时回报 $$G_{\tau,n} \leftarrow \sum_{i=1}^{n} \gamma^{i-1} R_{\tau+i}$$
>       - 若 $S_{t+1}$ 不为终止状态，在策略 $\pi(S_{t+1})$ 下选取行动 $A_{t+1}$，统计期望回报 $$G_{\tau,n} \leftarrow G_{\tau,n} + \gamma^n Q\left(S_{\tau+n},A_{\tau+n}\right)$$
>       - 更新价值函数 $$Q(S_{t}, A_{t}) \leftarrow Q(S_{t}, A_{t})+\alpha\left[G_{\tau,n}-Q(S_{t}, A_{t})\right]$$
>       - 找到最优行动 $$a^{*} = \arg \max _a Q\left(S_t, a\right)$$
>       - 进行策略提升 $$\pi\left(a | S_t\right) \leftarrow \begin{cases}1-\varepsilon+\frac{\epsilon}{\left|\mathcal{A}\left(S_t\right)\right|} & \text { if } a=a^* \\ \frac{\epsilon}{\left|\mathcal{A}\left(S_t\right)\right|} & \text { if } a \neq a^*\end{cases}$$

对于期望 *Sarsa* 算法来说也是一样的，根据备份图可以写出其迭代目标

$$G_{t, n}=\gamma^n \sum_a \pi(a | s) q_{\pi}(S_{t}, a)+\sum_{i=1}^n \gamma^{i-1} R_{t+i}$$

其它部分都是一样的，不再赘述。

值得一提的是，由于 *Q-Learning* 是离线算法，我们不能简单的用 *n-step bootstrap* 对它进行扩展，而是需要用到 [强化学习重学系列(4) Monte Carlo Methods](http://blog.leanote.com/post/chty_syq/1fb4616b281d) 中讲到的重要性采样方法

设 $\pi$ 是一个 *$\epsilon$-greedy* 目标策略，$b$ 是一个探索性更强的行为策略，记重要性采样率

$$\rho_{t: T-1} = \prod_{k=t}^{T-1} \frac{\pi\left(A_k | S_k\right)}{b\left(A_k | S_k\right)}$$

那么迭代公式应写为

$$v_{\pi}\left(S_t\right) \leftarrow v_{\pi}\left(S_t\right)+\alpha \rho_{t: t+n-1}\left[G_{t,n}-v_{\pi}\left(S_t\right)\right]$$

写成 $q_{\pi}$ 的形式为

$$q_{\pi}\left(S_t,A_t\right) \leftarrow q_{\pi}\left(S_t,A_t\right)+\alpha \rho_{t+1: t+n}\left[G_{t,n}-q_{\pi}\left(S_t,A_t\right)\right]$$

注意这里的重要性采样率和 $v_{\pi}$ 函数有所不同，这是因为我们在采样 $q_{\pi}(S_t,A_t)$ 时，已经有了确定的 $A_{t}$，但是需要多采样一个 $A_{t+n}$.

> **Method 3. Off-policy N-step Sarsa.** 对于给定的 $n,\epsilon$，行为策略 $b$ 和 $\alpha \in (0,1]$，离线 *n-step Sarsa* 的算法流程如下
>
> 1. 对于 $s\in\mathcal{S},a\in\mathcal{A(s)}$，初始化 $Q(s,a), \pi(a|s)$
> 2. 枚举轨迹标号 $k = 0, 1,\cdots$
>   - 随机选取初始状态 $S_{0}$，在策略 $b(S_{0})$ 下选择行动 $A_{0}$
>   - 枚举时刻 $t = 0, 1, \cdots$
>       - 执行行动 $A_{t}$ 得到 $R_{t+1},S_{t+1}$
>       - 记 $\tau = t-n+1$，累加即时回报 $$G_{\tau,n} \leftarrow \sum_{i=1}^{n} \gamma^{i-1} R_{\tau+i}$$
>       - 若 $S_{t+1}$ 不为终止状态，在策略 $b(S_{t+1})$ 下选取行动 $A_{t+1}$，统计期望回报 $$G_{\tau,n} \leftarrow G_{\tau,n} + \gamma^n Q\left(S_{\tau+n},A_{\tau+n}\right)$$
>       - 计算重要性采样率 $$\rho \leftarrow \prod_{i=\tau+1}^{\tau+n} \frac{\pi\left(A_i | S_i\right)}{b\left(A_i | S_i\right)}$$
>       - 更新价值函数 $$Q(S_{t}, A_{t}) \leftarrow Q(S_{t}, A_{t})+\alpha\rho\left[G_{\tau,n}-Q(S_{t}, A_{t})\right]$$
>       - 找到最优行动 $$a^{*} = \arg \max _a Q\left(S_t, a\right)$$
>       - 进行策略提升 $$\pi\left(a | S_t\right) \leftarrow \begin{cases}1-\varepsilon+\frac{\epsilon}{\left|\mathcal{A}\left(S_t\right)\right|} & \text { if } a=a^* \\ \frac{\epsilon}{\left|\mathcal{A}\left(S_t\right)\right|} & \text { if } a \neq a^*\end{cases}$$

---

## *3. Tree Backup Algorithm(树形备份算法)*

我们仔细思考一个问题，为什么 *Q-Learning* 这样的离线算法不需要重要性采样？

这是因为 *Q-Learning* 使用 *max* 运算符来估计目标策略的期望值，也就是说在备份图上的每个结点处都考虑了所有子结点的影响，因此价值函数的更新不依赖于采样轨迹的分布。

类似的，期望 *Sarsa* 的备份图则是累加了所有子结点的贡献，因此其离线版本的算法同样不需要重要性采样。

我们考虑将期望 *Sarsa* 扩展到 *n-step* 的版本，如图所示

<center>![](/content-images/external/56d8abbd9b82f56ce3783ce6550181d7.jpg)</center>

对于树上的每个结点，我们统计其所有子结点的贡献，例如在结点 $S_{t+1}$ 处采样了行动 $A_{t+1}$ 后

- $A_{t+1}$ 结点的贡献依赖于后续的采样，可以由 $G_{t+1,n-1}$ 递归计算
- 其它子结点 $a$ 的贡献由 $q_{\pi}(S_{t+1},a)$ 进行估计

由此我们统计树上所有结点的贡献得到

$$G_{t,n} = R_{t+1}+\gamma \sum_{a \neq A_{t+1}} \pi\left(a | S_{t+1}\right) q_{\pi}\left(S_{t+1}, a\right)+\gamma \pi\left(A_{t+1} | S_{t+1}\right) G_{t+1,n-1}$$

其中递归的边界是计算 $G_{t+n-1,1}$ 时，此时问题退化为 *1-step* 的期望 *Sarsa*，直接利用下式计算即可

$$G_{t,1} = R_{t+1}+\gamma \sum_a \pi\left(a | S_{t+1}\right) q_{\pi}\left(S_{t+1}, a\right)$$

> **Method 4. N-step Tree Backup.** 对于给定的 $n,\epsilon$，行为策略 $b$ 和 $\alpha \in (0,1]$，算法流程如下
>
> 1. 对于 $s\in\mathcal{S},a\in\mathcal{A(s)}$，初始化 $Q(s,a), \pi(a|s)$
> 2. 枚举轨迹标号 $k = 0, 1,\cdots$
>   - 随机选取初始状态 $S_{0}$，在策略 $b(S_{0})$ 下选择行动 $A_{0}$
>   - 枚举时刻 $t = 0, 1, \cdots$
>       - 执行行动 $A_{t}$ 得到 $R_{t+1},S_{t+1}$
>       - 记 $\tau = t-n+1$，计算 $$G_{t,1} = \begin{cases}R_{t+1}+\gamma \sum_a \pi\left(a | S_{t+1}\right) Q\left(S_{t+1}, a\right), & \text{if } S_{t+1} \text{ is terminal} \\ R_{t+1}, & \text{otherwise}\end{cases}$$
>       - 枚举 $k = t, t-1,\cdots,\tau+1$ 递推计算 $$G_{k-1, t-k+2} = R_{k} + \gamma \sum_{a \neq A_k} \pi\left(a | S_k\right) Q\left(S_k, a\right)+\gamma \pi\left(A_k | S_k\right) G_{k,t-k+1}$$
>       - 更新价值函数 $$Q(S_{t}, A_{t}) \leftarrow Q(S_{t}, A_{t})+\alpha\left[G_{\tau,n}-Q(S_{t}, A_{t})\right]$$
>       - 找到最优行动 $$a^{*} = \arg \max _a Q\left(S_t, a\right)$$
>       - 进行策略提升 $$\pi\left(a | S_t\right) \leftarrow \begin{cases}1-\varepsilon+\frac{\epsilon}{\left|\mathcal{A}\left(S_t\right)\right|} & \text { if } a=a^* \\ \frac{\epsilon}{\left|\mathcal{A}\left(S_t\right)\right|} & \text { if } a \neq a^*\end{cases}$$
