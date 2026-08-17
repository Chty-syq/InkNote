---
type: markdown
title: 强化学习重学系列(5) Temporal Difference
slug: "3209674"
order: 16
date: 2024-06-05
updatedAt: 2026-07-08 23:53:01
tags:
  - 强化学习
published: true
category: machine-learning
---

## *1. Temporal-Difference Prediction(TD预测)*

虽然蒙特卡罗方法能够在 *model free* 的环境下利用采样轨迹进行学习，但是如果在给定的环境下无法采样出完整的轨迹，我们就得使用 *temporal difference(时序差分)* 的方法了。

在蒙特卡罗方法中，我们使用 $G_t$ 的均值来估计期望收益，而在 TD 方法中，我们没有完整的轨迹，考虑 *Bellman* 方程

$$v_\pi(s)=E_\pi\left[R_{t+1}+\gamma v_\pi\left(S_{t+1}\right) \mid S_t=s\right]$$

在状态 $s$ 下，我们可以使用策略 $\pi$ 进行一步采样，将得到的 $R_{t+1}+\gamma v_\pi\left(S_{t+1}\right)$ 作为 $G_{t}$ 的近似值，此时有

$$v_{\pi}\left(S_t\right) \leftarrow v_{\pi}\left(S_t\right)+\alpha\left(R_{t+1}+\gamma v_{\pi}\left(S_{t+1}\right)-v_{\pi}\left(S_t\right)\right)$$

其中 $\alpha$ 为步长参数，我们介绍一些常用的术语定义：

- *TD target*： 迭代更新的目标 $R_{t+1}+\gamma v_{\pi}\left(S_{t+1}\right)$
- *TD error*： 当前价值与目标的差值 $R_{t+1}+\gamma v_\pi\left(S_{t+1}\right)-v_\pi\left(S_t\right)$
- *Bootstraping*：指用 *TD target* 近似 $G_{t}$ 引导价值迭代的方法

> **Method 1. TD Prediction(TD预测).** 对于给定的策略 $\pi$ 和步长参数 $\alpha \in (0,1]$，使用 $\mathrm{TD}(0)$ 方法评估价值函数的算法流程如下：
>
> 1. 对于状态 $s\in\mathcal{S}$，初始化 $v_{\pi}(s)$.
> 2. 枚举轨迹标号 $k = 0, 1,\cdots$
>   - 随机选取初始状态 $S_{0}$
>   - 枚举时刻 $t = 0, 1, \cdots$
>       - 在策略 $\pi(S_{t})$ 下选取行动 $A_{t}$，得到 $R_{t+1},S_{t+1}$
>       - 更新价值函数 $$v_{\pi}\left(S_t\right) \leftarrow
v_{\pi}\left(S_t\right)+\alpha\left(R_{t+1}+\gamma v_{\pi}\left(S_{t+1}\right)-v_{\pi}\left(S_t\right)\right)$$
>       - 若达到结束状态则退出循环，继续执行下一条轨迹

我们根据下面的公式来说明 TD 方法与之前介绍的动态规划方法和蒙特卡罗方法的联系与不同之处

\begin{aligned}
v_\pi(s) & = \mathbb{E}_\pi\left[G_t \mid S_t=s\right]\\
& =\mathbb{E}_\pi\left[R_{t+1}+\gamma G_{t+1} \mid S_t=s\right] \\
& =\mathbb{E}_\pi\left[R_{t+1}+\gamma v_\pi\left(S_{t+1}\right) \mid S_t=s\right]
\end{aligned}

- 动态规划方法使用最后一个式子，根据下一时刻的状态价值 $v_\pi\left(S_{t+1}\right)$ 和状态转移方程 $p$ 直接计算期望值
- 蒙特卡罗方法使用第一个式子，通过采样完整的轨迹估计 $G_{t}$ 的期望值
- TD 方法使用最后一个式子，在状态 $s$ 进行了一步采样来估计式子的期望值

我们看到 TD 方法结合了动态规划与蒙特卡罗方法的优势，可以在 *model free* 的环境中持续学习。虽然 TD 使用的估计方法是有偏的，但是拥有更小的方差，在实践中通常更为高效。

---

## *2. Temporal-Difference Control(TD控制)*

首先我们需要把状态价值的估计写成行动价值的估计，如图所示

<center><img src="/content-images/external/578545b0cbb2793790e711ebf781bbb0.jpg" width=800></center>

我们观察 $(s,a)$ 数对的转移过程，可以写出 $q_{\pi}(s,a)$ 的迭代式

$$q_{\pi}\left(S_t, A_t\right) \leftarrow q_{\pi}\left(S_t, A_t\right)+\alpha\left[R_{t+1}+\gamma q_{\pi}\left(S_{t+1}, A_{t+1}\right)-q_{\pi}\left(S_t, A_t\right)\right]$$

每一次更新，我们需要 $\left(S_t, A_t, R_{t+1}, S_{t+1}, A_{t+1}\right)$ 五个数据，每次更新完成后，我们按照之前的套路进行策略提升即可。

首先我们介绍一种在线算法，该算法使用 *$\varepsilon$-greedy* 策略进行价值评估与策略提升。

> **Method 2. Sarsa.** 对于给定的步长参数 $\alpha \in (0,1]$ 和 $\epsilon$，*Sarsa* 算法的流程如下
>
> 1. 对于 $s\in\mathcal{S},a\in\mathcal{A(s)}$，初始化 $Q(s,a), \pi(a|s)$
> 2. 枚举轨迹标号 $k = 0, 1,\cdots$
>   - 随机选取初始状态 $S_{0}$，在策略 $\pi(S_{0})$ 下选择行动 $A_{0}$
>   - 枚举时刻 $t = 0, 1, \cdots$
>       - 执行行动 $A_{t}$ 得到 $R_{t+1},S_{t+1}$，在策略 $\pi(S_{t+1})$ 下选取行动 $A_{t+1}$
>       - 更新价值函数 $$Q(S_{t}, A_{t}) \leftarrow Q(S_{t}, A_{t})+\alpha\left[R_{t+1}+\gamma Q\left(S_{t+1}, A_{t+1}\right)-Q(S_{t}, A_{t})\right]$$
>       - 找到最优行动 $$a^{*} = \arg \max _a Q\left(S_t, a\right)$$
>       - 进行策略提升 $$\pi\left(a | S_t\right) \leftarrow \begin{cases}1-\varepsilon+\frac{\epsilon}{\left|\mathcal{A}\left(S_t\right)\right|} & \text { if } a=a^* \\ \frac{\epsilon}{\left|\mathcal{A}\left(S_t\right)\right|} & \text { if } a \neq a^*\end{cases}$$

强化学习早期的一个重要突破是 *Q-Learning* 离线算法，不同于 *Sarsa* 使用同一个策略 $\pi$ 进行采样和价值估计，*Q-Learning* 方法直接根据价值函数选择最优行动进行迭代更新。

> **Method 3. Q-Learning.** 对于给定的步长参数 $\alpha \in (0,1]$ 和 $\epsilon$，*Q-Learning* 算法的流程如下
>
> 1. 对于 $s\in\mathcal{S},a\in\mathcal{A(s)}$，初始化 $Q(s,a), \pi(a|s)$
> 2. 枚举轨迹标号 $k = 0, 1,\cdots$
>   - 随机选取初始状态 $S_{0}$
>   - 枚举时刻 $t = 0, 1, \cdots$
>       - 在策略 $\pi(S_{t})$ 下选择行动 $A_{t}$，得到 $R_{t+1},S_{t+1}$
>       - 更新价值函数 $$Q(S_{t}, A_{t}) \leftarrow Q(S_{t}, A_{t})+\alpha\left[R_{t+1}+\gamma \max_{a}Q\left(S_{t+1}, a\right)-Q(S_{t}, A_{t})\right]$$
>       - 找到最优行动 $$a^{*} = \arg \max _a Q\left(S_t, a\right)$$
>       - 进行策略提升 $$\pi\left(a | S_t\right) \leftarrow \begin{cases}1-\varepsilon+\frac{\epsilon}{\left|\mathcal{A}\left(S_t\right)\right|} & \text { if } a=a^* \\ \frac{\epsilon}{\left|\mathcal{A}\left(S_t\right)\right|} & \text { if } a \neq a^*\end{cases}$$

在 *Q-Learning* 算法中，我们仅从策略 $\pi$ 中采样状态 $S_{t+1}$ 与 $R_{t+1}$，然后直接贪心的选择行动

$$A_{t+1} = \arg\max_{a} Q(S_{t+1},a)$$

进行价值更新，因此这是一个离线算法。

*Sarsa* 算法训练出的智能体通常比较保守，因为它会对环境中的惩罚较为敏感，而 *Q-Learning* 更关注极大化 $Q(s,a)$ 值，因此表现得更为激进一些。

--- 

## *3. Expected Sarsa(期望的Sarsa算法)*

我们考虑在 *Q-Learning* 不直接使用贪心方法进行迭代，而是使用期望

$$\begin{aligned}
Q\left(S_t, A_t\right) & \leftarrow Q\left(S_t, A_t\right)+\alpha\left[R_{t+1}+\gamma \mathbb{E}_\pi\left[Q\left(S_{t+1}, A_{t+1}\right) \mid S_{t+1}\right]-Q\left(S_t, A_t\right)\right] \\
& =Q\left(S_t, A_t\right)+\alpha\left[R_{t+1}+\gamma \sum_a \pi\left(a | S_{t+1}\right) Q\left(S_{t+1}, a\right)-Q\left(S_t, A_t\right)\right]
\end{aligned}$$

也就是说，在状态 $S_{t+1}$ 下，算法倾向于向 *Sarsa* 期望移动的方向进行移动，因此我们把该算法称为 *Expected Sarsa*.

值得注意的是，虽然该方法的名字与 *Sarsa* 沾边，但是迭代更新时使用的策略与采样策略仍然是不同的，因此它是一种离线算法。

> **Method 4. Expected Sarsa.** 对于给定的步长参数 $\alpha \in (0,1]$ 和 $\epsilon$，期望 *Sarsa* 算法的流程如下
>
> 1. 对于 $s\in\mathcal{S},a\in\mathcal{A(s)}$，初始化 $Q(s,a), \pi(a|s)$
> 2. 枚举轨迹标号 $k = 0, 1,\cdots$
>   - 随机选取初始状态 $S_{0}$
>   - 枚举时刻 $t = 0, 1, \cdots$
>       - 在策略 $\pi(S_{t})$ 下选择行动 $A_{t}$，得到 $R_{t+1},S_{t+1}$
>       - 更新价值函数 $$Q(S_{t}, A_{t}) \leftarrow Q\left(S_t, A_t\right)+\alpha\left[R_{t+1}+\gamma \sum_a \pi\left(a | S_{t+1}\right) Q\left(S_{t+1}, a\right)-Q\left(S_t, A_t\right)\right]$$
>       - 找到最优行动 $$a^{*} = \arg \max _a Q\left(S_t, a\right)$$
>       - 进行策略提升 $$\pi\left(a | S_t\right) \leftarrow \begin{cases}1-\varepsilon+\frac{\epsilon}{\left|\mathcal{A}\left(S_t\right)\right|} & \text { if } a=a^* \\ \frac{\epsilon}{\left|\mathcal{A}\left(S_t\right)\right|} & \text { if } a \neq a^*\end{cases}$$

期望 *Sarsa* 算法在计算上比 *Sarsa* 更复杂，但它消除了由于随机选择 $A_{t+1}$ 而导致的方差，因此它在实践中的表现略好于 *Sarsa*.

<center><img src="/content-images/external/1cb6a5ee11e12234e48e0d67cd63d2c3.jpg"><img src="/content-images/external/ed550273532c517754a7e23d0bb25a19.jpg"><img src="/content-images/external/1e04c90dc341fa08ebfecf179821351a.jpg"></center>

如上图所示，我们用 *backup diagrams(备份图)* 比较这三种算法

- *Sarsa* 使用当前策略下执行的下一行动 $a^{\prime}$ 作为更新依据，充分进行了探索，其收敛更加稳定
- *Q-learning* 使用下一状态的最大 $Q$ 值作为更新依据，倾向于快速利用最优动作，收敛速度快，但不够稳定
- *Expected Sarsa* 使用下一个动作的期望 $Q$ 值作为更新依据，在探索和利用，以及收敛速度和稳定性之间进行了平衡

--- 

## *4. Maximization Bias and Double Learning(最大值偏差和双学习)*

我们之前介绍的控制算法中都用到了 $\max$ 操作符来构建 *TD target*，例如 *Sarsa* 算法的 *$\varepsilon$-greedy* 策略使用 $\max$ 进行贪心选择，而 *Q-Learning* 更是直接使用 $\max$ 选择最大的价值函数作为目标。

也就是说，我们采样得到的价值函数最大值被用做对其真实值的估计，这往往会导致一个较大的偏差，我们用一个例子来说明。

> **Example 5.** 在下图所示的 MDP 中，$A,B$ 为非终止状态
> <center>![](/content-images/external/cbc7dfd3ae4531762388fda230d38f64.png)</center>
> 我们从状态 $A$ 出发，每次可以选择 $\{\text{left},\text{right}\}$ 两种行动，向右走直接终止，向左走转移到状态 $B$，在状态 $B$ 下的任意行动都会终止，并获得一个服从高斯分布 $N(-0.1, 1)$ 的随机奖励。

我们看到在状态 $A$ 下，向左走的期望回报是 $-0.1$，因此应该向右走。

但是我们使用 TD 方法采样得到的 $Q(A,\text{left})$ 中是有正有负的，算法会选择其中的最大值作为引导目标，使智能体倾向于向左走。

如何减小这种偏差呢？我们使用两个估计器 $Q_{1}(s,a),Q_{2}(s,a)$，在迭代更新时，使用 $Q_{1}$ 进行贪心得到 

$$a^*=\arg \max _a Q_1(s,a)$$

然后使用 $Q_{2}(s,a^{*})$ 作为 *TD target* 进行价值更新。

> **Method 6. Double Q-Learning.**  对于给定的步长参数 $\alpha \in (0,1]$ 和 $\epsilon$，使用双学习器的 *Q-Learning* 算法流程如下
>
> 1. 对于 $s\in\mathcal{S},a\in\mathcal{A(s)}$，初始化 $Q_{1}(s,a),Q_{2}(s,a), \pi(a|s)$
> 2. 枚举轨迹标号 $k = 0, 1,\cdots$
>   - 随机选取初始状态 $S_{0}$
>   - 枚举时刻 $t = 0, 1, \cdots$
>       - 在策略 $\pi(S_{t})$ 下选择行动 $A_{t}$，得到 $R_{t+1},S_{t+1}$
>       - 有 $0.5$ 的概率更新估计器 $$Q_{1}(S_{t}, A_{t}) \leftarrow Q_{1}(S_{t}, A_{t})+\alpha\left[R_{t+1}+\gamma Q_2\left(S_{t+1}, \arg \max _a Q_1\left(S_{t+1}, a\right)\right)-Q_{1}(S_{t}, A_{t})\right]$$
>       - 另外 $0.5$ 的概率更新 $$Q_2(S_{t}, A_{t}) \leftarrow Q_2(S_{t}, A_{t})+\alpha\left[R_{t+1}+\gamma Q_1\left(S_{t+1}, \arg\max_a Q_2\left(S_{t+1}, a\right)\right)-Q_2(S_{t}, A_{t})\right]$$
>       - 找到最优行动 $$a^{*} = \arg \max _a \left[Q_{1}\left(S_t, a\right) + Q_{2}(S_{t},a)\right]$$
>       - 进行策略提升 $$\pi\left(a | S_t\right) \leftarrow \begin{cases}1-\varepsilon+\frac{\epsilon}{\left|\mathcal{A}\left(S_t\right)\right|} & \text { if } a=a^* \\ \frac{\epsilon}{\left|\mathcal{A}\left(S_t\right)\right|} & \text { if } a \neq a^*\end{cases}$$

我们之后要介绍的 *double dqn* 就是使用了双学习的思想来减小偏差，具体的数学证明，就留到那时候在讲吧。
