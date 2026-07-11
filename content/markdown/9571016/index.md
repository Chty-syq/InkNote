---
type: markdown
title: 强化学习重学系列(1) Multi-armed Bandits
slug: "9571016"
order: 19
date: 2024-05-29
updatedAt: 2026-07-01 01:26:19
tags:
  - 强化学习
published: true
category: machine-learning
---

虽然博主从2022年底便开始接触强化学习，也做过诸如 *Flappy bird*，*SMAC* 这样的练手项目，甚至使用强化学习独立完成过大型项目用于我司的生产实践，但总觉得所学知识较为零碎，因此需要重新串一遍。

本系列基于强化学习圣经 [Reinforcement Learning: An Introduction](http://incompleteideas.net/book/RLbook2020.pdf)，从多臂老虎机的例子出发，引出马尔科夫模型，来刻画强化学习问题，最后介绍各种经典的求解方法。

博主常常听闻将强化学习归类于无监督学习的论调，它们的相同之处在于都不需要 *ground truth* 进行监督，而区别也是显著的。无监督学习致力于寻找输入特征中的隐藏结构，利用这种隐藏结构进行推理，而强化学习则是采用奖励机制，令智能体不断与环境中交互，根据奖励信号来训练智能体的行为。

本章以多臂老虎机为例，介绍一些基本的概念和学习方法，在后续的章节中我们将扩展这些方法，用于真正的强化学习。

---

## *1. The k-armed Bandit Problem(k臂老虎机问题)*

多臂老虎机问题是一个经典的的强化学习问题。

我们有一个 $k$ 个手臂的老虎机，当拉动其中一条手臂时，老虎机会根据你拉动的手臂在某个概率分布下给予你一个随机的奖励。

我们的目标是在有限次的拉动后（比如拉动 $1000$ 次手臂），使获得的总奖励尽量大。

显然我们在每次拉动时都有 $k$ 个选择，我们把它称为一次 *action(行动)*，每个行动都有一个期望奖励，我们把它称为该行动的 *value(价值)*.

记 $t$ 时刻我们选择的行动是 $A_{t}$，获得的奖励为 $R_{t}$，对于任意的行动 $a\in \{1,\cdots, k\}$，我们定义其价值为

$$q_*(a) = \mathbb{E}\left[R_t \mid A_t=a\right]$$

如果我们知道每个手臂给予奖励的概率分布的话，我们就能轻而易举的写出每个行动的价值，那么每次只需要选择价值最高的行动即可。然而在赌场中并不会有如此便宜的事，我们并不知道老虎机背后的概率分布。

但是我们在时刻 $t$ 时已经进行了 $t-1$ 次尝试，根据这些结果我们对每个行动的价值可以有一个估计值 $Q_t(a)$，我们希望这个估计值尽可能的接近真实值。

一个自然的想法是利用前 $t-1$ 次尝试中，选择行动 $a$ 获得的奖励的平均值来估计该行动的价值，即

$$Q_t(a) = \frac{\sum_{i=1}^{t-1} R_i \cdot \mathbb{I}(A_i=a)}{\sum_{i=1}^{t-1} \mathbb{I}(A_i=a)}$$

其中恒等函数 $\mathbb{I}(\text{condition})$ 表示当 *condition* 满足时函数值为 $1$，否则为 $0$.

根据大数定律，当 $t\rightarrow \infty$ 时，$Q_t(a)$ 收敛于 $q_*(a)$.

接下来我们根据 $Q_t(a)$ 选择价值最大的 $a$ 作为 $t$ 时刻采取的行动

$$A_t = \underset{a}{\arg \max } Q_t(a)$$

我们这样贪心选择最高价值的行动，本质上是利用当前知识来最大化即时奖励，而没有去尝试其它行动来验证是否存在更好的选择。

为了探索可能存在的更好的行动选择，我们常常选择 $\varepsilon$-greedy 方法

> **Method 1. $\varepsilon$-Greedy** 为了保证智能体在环境中进行充分的探索，我们在每一步选取行动的时候，有 $\varepsilon\in [0,1]$ 的概率选择一个随机行动，另外 $1-\varepsilon$ 的概率采取贪心策略。

我们把之前讨论的，根据历史经验选择最优行动的贪心策略称为 *exploitation(利用)*，即智能体对过往观测的利用。把选择随机行动称为 *exploration(探索)*，即智能体对于环境的探索。

为了最大化奖励，智能体必须选择过去已经尝试过的最优行动，但是想要准确的计算出这个最优行动，智能体又必须充分尝试所有可能的行动。

在强化学习中，*exploitation* 与 *exploration* 的 *trade-off(权衡)* 是一个非常重要的问题。

在 $\varepsilon$-greedy 方法中，如何选择 $\varepsilon$ 的值往往与任务本身有关，对于环境复杂的任务，往往需要更多的探索。

我们选择平均奖励作为行动价值的估计值，可以将它写成增量形式来减少计算量。对于前 $n$ 次行动的平均奖励 $Q_{n+1}$，有

$$\begin{aligned}
Q_{n+1} &=\frac{1}{n} \sum_{i=1}^n R_i \\
& =\frac{1}{n}\left(R_n+\sum_{i=1}^{n-1} R_i\right) \\
& =\frac{1}{n}\left(R_n+(n-1) Q_n\right) \\
& =Q_n+\frac{1}{n}\left[R_n-Q_n\right],
\end{aligned}$$

这是一种递推的形式，且各项都是拥有明确意义的

$$\text {NewEstimate} \leftarrow \text {OldEstimate}+ \text {StepSize}[\text {Target}- \text {OldEstimate}]$$

现在我们就获得了解决多臂老虎机问题的一个方法。

> **Method 2. A Simple Bandit Algorithm.** 解决多臂老虎机问题的算法流程如下:
> 
> 1. 对于所有行动 $a\in \{1,\cdots, k\}$，初始化 $$Q_{0}(a)=0, \quad N_{0}(a) = 0$$
> 2. 枚举时刻 $t = 1, 2,\cdots, \infty$
> - 选择行动 $$A_{t} = \left\{\begin{array}{ll}
\operatorname{argmax}_a Q_{t-1}(a) & \text { with probability } 1-\varepsilon\\
\text {random action } & \text { with probability } \varepsilon
\end{array} \quad\right.$$
> - 老虎机给予奖励 $R_{t} = \operatorname{bandit}(A_{t})$
> - 更新行动价值估计函数 $$\begin{aligned}
& N_{t}(A_{t}) = N_{t-1}(A_{t})+1 \\
& Q_{t}(A_{t}) = Q_{t-1}(A_{t-1})+\frac{1}{N_{t-1}(A_{t})}[R_{t}-Q_{t-1}(A_{t})]
\end{aligned}$$

---

## *2. Generalization(一些拓展)*

### *2.1 The Nonstationary Problem(不稳定问题)*

在之前的讨论中，我们的老虎机是稳定的，即每次拉动时奖励的概率分布是恒定不变的，而在真实情况下，我们每次与老虎机交互后，老虎机的状态都可能发生变化，给予的奖励也会变得不稳定起来。

为了解决不稳定的问题，我们常用的方法是改变行动价值函数迭代更新的步长为 $\alpha \in (0,1]$，得到

$$Q_{n+1} = Q_n+\alpha\left[R_n-Q_n\right]$$

记 $\alpha_{n}(a)$ 表示行动 $a$ 在第 $n$ 次迭代更新时的步长参数，根据概率逼近理论的结果，为了保证 $n\rightarrow \infty$ 时估计函数收敛于真实值，步长参数必须满足

$$\sum_{n=1}^{\infty} \alpha_n(a)=\infty,  \quad \sum_{n=1}^{\infty} \alpha_n^2(a)<\infty$$

第一个式子保证了步长足够大，能够克服初始条件的影响。

第二个式子保证了步长足够小，能够保证收敛性。

在上一节中，我们使用的平均值方法 $\alpha_n(a)=\frac{1}{n}$，显然是满足这个条件的。

### *2.2 Optimistic Initial Values(乐观的初始值)*

当我们使用一般性的步长 $\alpha$ 后，我们的估计函数不再是一个无偏估计了，其初始值 $Q_{0}$ 的影响虽然会随时间的增大而减小，但是偏差不会消失。

在实践中，这种偏差通常不是问题，但是初始值不能再简单的设置为 $0$，而是需要实验调整的超参数。

如果我们使用较为乐观的初始值，例如我们设置所有的 $Q_{0}(a) = 100$，那么根据贪心策略，每次迭代更新时，行动价值函数的值都会减小，智能体将倾向于选择其它行动。

也就是说，乐观的初始值能起到鼓励探索的作用，这种技巧在稳定问题中非常有效。

但是由于乐观初始值仅作用于刚开始的时刻，随着时间的流逝其效果逐渐降低，如果环境是不稳定的，其鼓励探索的作用将会非常有限。

### *2.3 Upper-Confidence-Bound Action Selection(基于置信域上界的行动选择)*

最后我们在讨论一下行动选择的问题，我们的 *$\varepsilon$-greedy* 方法虽然能够探索非最优的行动，但只是等概率的选择它们，而没有考虑这些非最优行动的潜力。

我们考虑根据历史信息来确定每个非最优行动的潜力，设行动价值 $Q(a)$ 与其真实值 $q_{*}(a)$ 存在差距 $\delta$，即

$$Q(a) - \delta \leq q_{*}(a) \leq Q(a) + \delta$$

这是真实值 $q_{*}(a)$ 的置信域，我们可以把它的上界作为行动 $a$ 的潜力，剩下的问题就是如何得到 $\delta$.

假设老虎机是稳定的，且我们使用均值来估计行动价值，即

$$Q(a)=\frac{1}{n} \sum_{i=1}^n R_i$$

其中每个奖励 $R_{i}$ 都是独立同分布的随机变量，且 $R_{i}\in[a,b]$，其期望值 $\mathbb{E}[R_{i}] = q_{*}(a)$，因此


$$\left|Q(a) - q_{*}(a)\right| = \left| \frac{1}{n} \sum_{i=1}^n\left(R_i-\mathbb{E}\left[R_i\right]\right) \right|$$

根据 [*Hoeffding’s Inequality(霍夫丁不等式)*](http://blog.leanote.com/post/chty_syq/Hoeffding%E2%80%99s-inequality) 有

$$\mathbb{P}(\left|Q(a)-q_*(a)\right|\leq \delta) \geq 1 - 2\exp \left(-\frac{2 n \delta^2}{(b-a)^2}\right)$$

我们取 $\delta = c \sqrt{\frac{\ln t}{n}}$，得到

$$RHS = 1 - \frac{2}{t^{c}}$$

其中 $c$ 为常数，取合适的 $c$ 可以使得这个概率非常接近 $1$，相应的行动选取方法为

$$A_t = \underset{a}{\operatorname{argmax}}\left[Q_t(a)+c \sqrt{\frac{\ln t}{N_t(a)}}\right]$$

直观理解一下，当 $N_{t}(a)$ 增大时，被选中的行动 $a$ 的潜力降低，而当 $t$ 增大时，所有未被选中的行动 $a$ 的潜力升高，这与我们的需求是一致的。

--- 

## *3. Gradient Bandit Algorithms(梯度方法)*

在前面的两节中，我们使用的方法都是基于行动价值函数的，每次选择最大价值的行动作为贪心策略。本节我们介绍一种基于策略的方法。

我们为每种行动设定一个偏好值 $H_{t}(a)$，定义策略函数

$$\pi_t(a) = \mathbb{P}(A_t=a) = \frac{e^{H_t(a)}}{\sum_{b=1}^k e^{H_t(b)}} $$

表示 $t$ 时刻选择行动 $a$ 的概率分布，这里我们使用了 *softmax distribution* 来保证它是一个概率分布。

现在我们的目标是确定所有行动的偏好值，从而确定策略函数，这样的话就能使用策略函数选择行动了。

考虑梯度上升算法，在 $t$ 时刻，我们沿奖励 $R_{t}$ 对于各参数 $H_{t}(a)$ 的梯度方向更新参数值

$$H_{t+1}(a) = H_t(a)+\alpha \frac{\partial \mathbb{E}\left[R_t\right]}{\partial H_t(a)}$$

这里 $\alpha$ 为步长，奖励的期望

$$\mathbb{E}\left[R_t\right]=\sum_x \pi_t(x) q_*(x)$$

因此右边的梯度可以展开为

$$\begin{aligned}
\frac{\partial \mathbb{E}\left[R_t\right]}{\partial H_t(a)} & =\frac{\partial}{\partial H_t(a)}\left[\sum_x \pi_t(x) q_*(x)\right] \\
& =\sum_x q_*(x) \frac{\partial \pi_t(x)}{\partial H_t(a)}
\end{aligned}$$

我们不知道老虎机的真实奖励 $q_*(x)$，推导似乎被卡住了，需要魔法来拯救它。由于

$$\sum_x \frac{\partial \pi_t(x)}{\partial H_t(a)}=\frac{\partial\sum_x \pi_t(x)}{\partial H_t(a)} =0$$

我们可以引入一个不依赖于 $x$ 的 *baseline(基线)* $B_{t}$，得到

$$\begin{aligned}\frac{\partial \mathbb{E}\left[R_t\right]}{\partial H_t(a)}
&= \sum_x\left(q_*(x)-B_t\right) \frac{\partial \pi_t(x)}{\partial H_t(a)} \\
&= \sum_x \pi_t(x)\left(q_*(x)-B_t\right) \frac{\partial \pi_t(x)}{\partial H_t(a)} / \pi_t(x) \\
&= \mathbb{E}\left[\left(q_*\left(A_t\right)-B_t\right) \frac{\partial \pi_t\left(A_t\right)}{\partial H_t(a)} / \pi_t\left(A_t\right)\right] \\
&= \mathbb{E}\left[\left(R_t-\bar{R}_t\right) \frac{\partial \pi_t\left(A_t\right)}{\partial H_t(a)} / \pi_t\left(A_t\right)\right]
\end{aligned}$$

这里稍作解释，我们把 $\pi_{t}(x)$ 提出来，将原本关于 $R_{t}$ 的期望变换成了关于 $A_{t}$ 的期望，然后用之前观测到的平均奖励 $\bar{R}_t$ 作为基线 $B_{t}$，并利用 $q_*\left(A_t\right) = R_{t}$ 替换掉了 $q_{*}(A_{t})$.

这里的妙处在于计算 $\mathbb{E}\left[R_t\right]$ 时，在 $t$ 时刻选择任意行动 $x$ 的真实奖励 $q_{*}(x)$ 是未知的，而转换成计算 $A_{t}$ 相关的期望后，$t$ 时刻执行 $A_{t}$ 的真实奖励是已知的 $R_{t}$.

现在我们的问题就是计算梯度了，根据商的求导法则，有

$$\begin{aligned} \frac{\partial \pi_t(x)}{\partial H_t(a)} 
& =\frac{\partial}{\partial H_t(a)}\left[\frac{e^{H_t(x)}}{\sum_{y=1}^k e^{H_t(y)}}\right] \\
& =\frac{\mathbb{I}(x=a) e^{H_t(x)} \sum_{y=1}^k e^{H_t(y)}-e^{H_t(x)} e^{H_t(a)}}{\left(\sum_{y=1}^k e^{H_t(y)}\right)^2} \\
& =\frac{\mathbb{I}(x=a) e^{H_t(x)}}{\sum_{y=1}^k e^{H_t(y)}}-\frac{e^{H_t(x)} e^{H_t(a)}}{\left(\sum_{y=1}^k e^{H_t(y)}\right)^2} \\
& =\mathbb{I}(x=a) \pi_t(x)-\pi_t(x) \pi_t(a) \\
& =\pi_t(x)\left\{\mathbb{I}(x=a)-\pi_t(a)\right\}
\end{aligned}$$

代回去得到

$$\frac{\partial \mathbb{E}\left[R_t\right]}{\partial H_t(a)} = \mathbb{E}\left[\left(R_t-\bar{R}_t\right)\left(\mathbb{I}(A_{t}=a)-\pi_t(a)\right)\right]$$

因此，我们在 $t$ 时刻根据策略 $\pi_{t}$采样得到 $A_{t},R_{t}$，即可更新偏好值

$$H_{t+1}(a)=H_t(a)+\alpha\left(R_t-\bar{R}_t\right)\left(\mathbb{I}(A_{t}=a)-\pi_t(a)\right)$$

值得注意的是，基线的选择不会影响算法的正确性，但会影响迭代的方差，从而影响收敛速度。实验证明我们选择 $\bar{R_{t}}$ 作为基线表现良好。

到目前为止，我们讨论的任务都是非关联的，即老虎机的状态不会根据选择的行动而变化，而在真正的强化学习任务中，每次选择的行动会影响环境的状态与获得的奖励的。在下一章节，我们将建立马尔科夫模型来描述这样的问题。
