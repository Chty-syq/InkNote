---
type: markdown
title: 强化学习重学系列(6) Learning the Model
slug: "1364178"
order: 15
date: 2024-06-06
updatedAt: 2026-07-08 23:53:01
tags:
  - 强化学习
published: true
category: machine-learning
---

## *1. Models and Planning(模型和规划)*

在强化学习中，我们常用 *model(模型)* 一词指代与智能体交互的环境模型，如果环境模型完全已知，那么我们可以使用动态规划算法，得到各状态下的最优策略，即

$$\text { model } \xrightarrow{\text { planning }} \text { policy }$$

这里我们用 *planning(规划)* 表示根据模型得到最优策略的过程。

如果是 *model-free* 的环境，我们之前介绍了蒙特卡罗和 TD 方法，这些方法根据在真实环境中采样得到的轨迹，从中学习价值函数与策略，即

$$\text { model } \xrightarrow{} \text{ simulated
experience } \xrightarrow{\text { backups }} \text{ values } \rightarrow \text { policy }$$

在这条路径上，我们关注的仅仅是价值函数和策略本身，而不关注环境模型具体的状态转移分布。一个自然的想法是，能不能尝试从采样得到的经验中对环境进行建模得到 *model*，然后再执行 *planning* 得到策略。

答案是肯定的，我们介绍一种最简单的 *Dyna-Q* 算法，如图所示

<center>![](/content-images/external/272093b1c5bc86ab3a5aa7bc0cbdcaf0.jpg)</center>

在 *Dyna-Q* 算法中，智能体与真实环境不断交互，获得一系列的经验轨迹。一方面，我们利用这些轨迹进行 *Q-Learning* 更新价值函数与策略，另一方面，我们使用这些轨迹对环境建模，并让智能体在我们建立的环境模型中采样生成模拟数据，进行 *Q-Learning* 更新价值函数与策略。

> **Method 1. Dyna-Q.** 对于给定 $\epsilon$ 和迭代次数 $N$，*Dyna-Q* 算法的流程如下
>
> 1. 对于 $s\in\mathcal{S},a\in\mathcal{A(s)}$，初始化 $Q(s,a), \pi(a|s), \text{Model}(s,a)$
> 2. 枚举轨迹标号 $k = 0, 1,\cdots$
>   - 随机选取初始状态 $S_{0}$
>   - 枚举时刻 $t = 0, 1, \cdots$
>       - 根据 *$\varepsilon$-greedy* 策略选择行动 $A_{t}=\text{Policy}(S,Q)$，得到 $R_{t+1},S_{t+1}$
>       - 更新价值函数 $$Q(S_{t}, A_{t}) \leftarrow Q(S_{t}, A_{t})+\alpha\left[R_{t+1}+\gamma \max_{a}Q\left(S_{t+1}, a\right)-Q(S_{t}, A_{t})\right]$$
>       - 进行环境建模 $$\text{Model}(S_{t},A_{t}) = (S_{t+1}, R_{t+1})$$
>       - 在模型中进行 $N$ 次模拟
>           1. 随机选取一个已经建模过的 $(S,A)$ 数对，根据模型 $\text{Model}(S,A)$ 获得 $(S^{\prime}, R)$
>           2. 更新价值函数 $$Q(S, A) \leftarrow Q(S, A)+\alpha\left[R+\gamma \max _a Q\left(S^{\prime}, a\right)-Q(S, A)\right]$$

*Dyna-Q* 算法由于对环境进行了建模，并从中采集模拟数据，因此对真实环境中采样的需求量减少了很多，具有更低的样本复杂度，故而能够更快收敛。我们用一个例子来说明这一点

> **Example 2. Maze(迷宫).** 在如图所示的迷宫中
> <center>![](/content-images/external/77f512bff879639fadd47f43324ad0ae.png)</center>
> 智能体从 $S$ 出发，每次可以向四个方向移动，到达重点 $G$ 时获得 $1$ 点奖励，之后返回起点 $S$ 开始新的一轮迷宫游戏。

在 *Dyna-Q* 算法中，若迭代次数 $N=0$，则等价于 *Q-Learning* 算法，此时每条轨迹只能学习到一个格子的最优策略，如图所示

<center>![](/content-images/external/ba40fa2fcc7451548215ea7200e1134b.png)</center>

而如果 $N=50$，那么利用模拟环境模型得到的数据，从第二条轨迹开始，就能学习到很多格子的最优策略。

---

## *2. When the Model Is Wrong(建模错误)*

在上一节介绍的迷宫示例中，我们建立的环境模型初始是空的，然后在学习过程中仅向其中添加正确的信息。

一般来说，我们不会如此幸运，因为环境是具有随机性的，我们只能观察到有限数量的样本，或者环境已经改变而我们尚未观测到新的行为，在这样的情况下，我们建立的模型就不准确了，此时我们使用模拟数据得到的策略可能就不是最优策略了。

> **Example 3. Blocking Maze(被阻塞的迷宫).** 在如图所示的迷宫中有一个档板
> <center>![](/content-images/external/0281dfde2db09ffff166b1e6c3852ddc.png)</center>
> 初始时刻档板位于左侧，此时存在一条较短的路径解，当 $t=100$ 时，档板右移一格，此时最短路径就成了从左侧绕过档板。

在这样的迷宫环境中，我们在档板变化之前建立了一个环境模型，它引导智能体从右侧的最短路径达到终点。

但是 $t=100$ 时，环境发生了变化，我们的建模就不准确了，它会引导智能体项右侧移动，发现路径被阻挡后，再从左侧绕回去。

当环境变化时，不准确的模型会使得算法的效率大大降低，而造成该问题的本质是对环境的探索不足，我们改进算法得到 *Dyna-Q+* 算法。

*Dyna-Q+* 算法的思想是鼓励智能体尝试长期未执行过的行动，并对这些行动的模拟数据给出一个附加奖励。

具体的，如果一次状态转移 $(s,a)\rightarrow(s^{\prime},r)$ 已经有 $\tau(s,a)$ 的时刻没有尝试过了，那么在模拟规划 $(s,a)$ 时，给予的奖励为 $r + \kappa \sqrt{\tau(s,a)}$，其中 $\kappa$ 为一个较小的常数。

> **Method 4. Dyna-Q+.** 对于给定 $\epsilon,\kappa$ 和迭代次数 $N$，*Dyna-Q+* 算法的流程如下
>
> 1. 对于 $s\in\mathcal{S},a\in\mathcal{A(s)}$，初始化 $Q(s,a), \pi(a|s), \text{Model}(s,a),\tau(s,a)$
> 2. 枚举轨迹标号 $k = 0, 1,\cdots$
>   - 随机选取初始状态 $S_{0}$
>   - 枚举时刻 $t = 0, 1, \cdots$
>       - 根据 *$\varepsilon$-greedy* 策略选择行动 $A_{t}=\text{Policy}(S,Q)$，得到 $R_{t+1},S_{t+1}$
>       - 更新价值函数 $$Q(S_{t}, A_{t}) \leftarrow Q(S_{t}, A_{t})+\alpha\left[R_{t+1}+\gamma \max_{a}Q\left(S_{t+1}, a\right)-Q(S_{t}, A_{t})\right]$$
>       - 进行环境建模 $$\text{Model}(S_{t},A_{t}) = (S_{t+1}, R_{t+1})$$
>       - 更新所有数对 $(s,a)$ 的时刻间隔 $$\tau(s,a) \leftarrow \begin{cases} 0, &\text{ if } (s,a) = (S_{t},A_{t}) \\ \tau(s,a) + 1, & \text{ otherwise }\end{cases}$$
>       - 在模型中进行 $N$ 次模拟
>           1. 随机选取一个已经建模过的 $(S,A)$ 数对，根据模型 $\text{Model}(S,A)$ 获得 $(S^{\prime}, R)$
>           2. 计算附加奖励 $$R\leftarrow R + \kappa \sqrt{\tau(S, A)}$$
>           3. 更新价值函数 $$Q(S, A) \leftarrow Q(S, A)+\alpha\left[R+\gamma \max _a Q\left(S^{\prime}, a\right)-Q(S, A)\right]$$

---

## *3. Prioritized Sweeping(优先扫描)*

考虑在 *Dyna-Q* 算法中获取模拟数据的方法，我们每次随机选取一个已建模的 $(s,a)$，通过模型进行一次状态转移得到 $(s^{\prime},r)$，然后利用 $s^{\prime}$ 的价值更新 $Q(s,a)$.

这里随机选取的效率是比较低的，因为如果 $s^{\prime}$ 的价值没有变化，那么这条模拟数据本质上没有起到任何效果。

一个自然的想法是我们只关注行动价值有变化的状态 $s^{\prime}$，每次模拟时，根据这些 $s^{\prime}$ 选择已建模的能够转移到 $s^{\prime}$ 的数对 $(s,a)$ 来更新 $Q(s,a)$.

我们使用优先队列来维护这个价值更新关系，每次智能体与真实环境交互后，我们将更新的价值 $Q(S_{t},A_{t})$ 加入到优先队列中，每次模拟我们从优先队列中取出一个 $(s,a)$ 更新其价值，然后枚举所有的前置 $(\bar{s},\bar{a})$ 加入到队列中。

> **Method 5. Prioritized Dyna-Q.** 对于给定的 $\epsilon,\theta$ 和迭代次数 $N$，*Dyna-Q* 算法的流程如下
>
> 1. 对于 $s\in\mathcal{S},a\in\mathcal{A(s)}$，初始化 $Q(s,a), \pi(a|s), \text{Model}(s,a)$，初始化优先队列 $Queue$
> 2. 枚举轨迹标号 $k = 0, 1,\cdots$
>   - 随机选取初始状态 $S_{0}$
>   - 枚举时刻 $t = 0, 1, \cdots$
>       - 根据 *$\varepsilon$-greedy* 策略选择行动 $A_{t}=\text{Policy}(S,Q)$，得到 $R_{t+1},S_{t+1}$
>       - 计算 *TD error* $$P = \left|R_{t+1}+\gamma \max _a Q\left(S_{t+1}, a\right)-Q(S_{t}, A_{t})\right|$$
>       - 进行环境建模 $$\text{Model}(S_{t},A_{t}) = (S_{t+1}, R_{t+1})$$
>       - 若 $P > \theta$，则将 $(S_{t},A_{t})$ 以优先级 $P$ 加入优先队列 $Queue$ 中
>       - 在模型中进行 $N$ 次模拟，且 $Queue$ 不为空
>           1. 从优先队列中取出 $(S,A)=first(Queue)$
>           2. 根据模型 $\text{Model}(S,A)$ 获得 $(S^{\prime}, R)$
>           3. 更新价值函数 $$Q(S, A) \leftarrow Q(S, A)+\alpha\left[R+\gamma \max _a Q\left(S^{\prime}, a\right)-Q(S, A)\right]$$
>           4. 枚举能够转移到 $S$ 的所有数对 $(\bar{S},\bar{A},\bar{R})$
                - 计算 *TD errer* $$\bar{P} =\left|\bar{R}+\gamma \max _a Q(S, a)-Q(\bar{S}, \bar{A})\right|$$
                - 若 $\bar{P} > \theta$，则将 $(\bar{S},\bar{A})$ 以优先级 $\bar{P}$ 加入优先队列 $Queue$ 中
