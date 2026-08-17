---
type: markdown
title: The Alpha-Zero Architecture
slug: "6576902"
order: 14
date: 2024-06-18
updatedAt: 2026-07-09 23:25:49
tags:
  - 强化学习
published: true
category: machine-learning
---

## *1. Monte-Carlo Tree Search(蒙特卡罗搜索树)*

不论是在 *model-based* 的动态规划，还是在 *model-free* 的 *Dyna-Q* 算法，本质上都是从模型获得模拟经验，然后进行 *planning* 改进价值函数。

智能体在状态 $S_{t}$ 下探索时，只需要根据价值函数所确定的策略 $\pi$ 选择行动即可，这样的规划方式我们称为 *offline-planning(离线规划)*.

与之相对的，另一种规划方式则是在到达状态 $S_{t}$ 后开始进行 *planning*，使用得到的模拟经验为 $S_{t}$ 选择最佳行动，称为 *online-planning(在线规划)*，接下来我们介绍一种在线规划算法。

> **Method 1. Monte-Carlo Tree Search(蒙特卡罗搜索树).** 如图所示
> <center><img src="/content-images/external/c3a34e1aa6957cc16f657dda772b2dcd.png" width=800px></center>
> 在状态 $S_{t}$ 下，我们通过如下算法找到最优行动 $A_{t}$
> 
> 1. 初始化价值函数 $Q(s,a)$，访问次数 $N(s,a)$，记 $N(s) = \sum_{a}N(s,a)$
> 2. 枚举 $i=1,2,\cdots,N$，共进行 $N$ 次 *rollout(模拟)*，每次模拟执行
>    - **Selection** 从根结点开始，不断根据 *UCB(置信区间上界)* 选择行动 $$a^{\prime} = \operatorname{argmax}_{a \in A(s)} Q(s, a)+2 C_p \sqrt{\frac{2 \ln N(s)}{N(s, a)}}$$ 到达搜索树上的某个叶结点，并记录访问路径 $\text{Path}(S_{t})$
>    - **Expand** 在叶结点代表的状态下随机选取行动 $a^{\prime}$，扩展出新的状态 $s^{\prime}$，并将其加入 $\text{Path}(S_{t})$ 中
>    - **Simulation** 在状态 $s^{\prime}$ 下进行随机模拟，得到奖励 $R$
>    - **Backpropagation** 进行反向传播，更新访问路径上结点 $s\in \text{Path}(S_{t})$ 的价值函数 $$\begin{aligned}
N(s, a) &\leftarrow N(s, a)+1 \\
Q(s, a) &\leftarrow Q(s, a)+\frac{1}{N(s, a)}[R-Q(s, a)]
\end{aligned}$$
> 3. 在根结点处选择访问次数最多的行动作为最优行动 $$A_{t} = \operatorname{argmax}_{a \in A(S_{t})} N(S_{t}, a)$$

---

## *2. The Neural Network(神经网络)*

单纯的使用 MCTS 时，我们需要在线预测每一个之前没搜索过的状态，如果状态数非常庞大，那么算法的效率往往很低，为此我们引入神经网络 $f_{\theta}$ 进行策略提升。

网络 $f_{\theta}$ 的根据输入状态 $s$ 预测该状态的价值函数 $v_{\theta}(s)\in [-1,1]$ 以及策略函数 $\pi_{\theta}(a|s)$.

我们使用 MCTS 进行策略提升，在 *selection* 阶段，使用变种的 *UCB* 来选择子结点

$$a^{\prime} = \operatorname{argmax}_{a \in A(s)} Q(s, a)+ C_{\text{puct}} \cdot \pi_{\theta}(a|s) {\frac{\sqrt{\ln N(s)}}{1 + N(s, a)}}$$

这里我们使用了策略函数 $\pi$ 来控制探索程度，实验表明这个变种的 *UCB* 表现良好。

在 *Expand* 阶段，我们不再随机选取行动，而是根据策略函数 $\pi$ 扩展所有行动结点，我们不再进行 *Simulation*，而是使用神经网络来预测该结点的价值 $v_{\theta}$.

最后的 *Backpropagation* 阶段没有变化，仍是使用那套公式更新路径上结点的价值函数 $Q$.

当 *rollout* 结束后，我们在每个状态结点 $s$ 处根据该结点访问次数进行策略提升

$$\pi_{
\theta}^{\prime}(a|s) = \frac{N(s,a)^{\frac{1}{\tau}}}{\sum_{b\in A(s)}N(s,b)^{\frac{1}{\tau}}} = \operatorname{Softmax}\left(\frac{1}{\tau}\log{N(s,a)}\right)$$

其中 $\tau$ 是一个实现指数衰减的 *temperature(温度)*，用以平衡 MCTS 对策略函数的影响。

> **Method 2. MCTS in AlphaZero.** 在状态 $S_{t}$ 以及网络参数 $\theta$ 下，我们通过如下算法进行策略提升
> 
> 1. 初始化价值函数 $Q(s,a)$，访问次数 $N(s,a)$，记 $N(s) = \sum_{a}N(s,a)$
> 2. 枚举 $i=1,2,\cdots,N$，共进行 $N$ 次 *rollout(模拟)*，每次模拟执行
>    - **Selection** 从根结点开始，不断根据变种 *UCB* 选择行动 $$a^{\prime} = \operatorname{argmax}_{a \in A(s)} Q(s, a)+ C_{\text{puct}} \cdot \pi_{\theta}(a|s) {\frac{\sqrt{\ln N(s)}}{1 + N(s, a)}}$$ 到达搜索树上的某个叶结点 $s_{\text{leaf}}$，并记录访问路径 $\text{Path}(S_{t})$
>    - **Expand**
>       - 若 $s_{\text{leaf}}$ 为结束状态，则 $V(s_{\text{leaf}})=-1$
        - 若 $s_{\text{leaf}}$ 不为结束状态，则使用神经网络预测 $V(s_{\text{leaf}}),\pi_{\theta}(a|s_{\text{leaf}})$，并扩展所有行动结点
>    - **Backpropagation** 进行反向传播，更新访问路径上结点 $s\in \text{Path}(S_{t})$ 的价值函数 $$\begin{aligned}
N(s, a) &\leftarrow N(s, a)+1 \\
Q(s, a) &\leftarrow Q(s, a)+\frac{1}{N(s, a)}[V(s_{\text{leaf}})-Q(s, a)]
\end{aligned}$$
> 3. 进行策略提升 $$\pi_{\theta}^{\prime}(a|S_{t}) = \operatorname{Softmax}\left(\frac{1}{\tau}\log{N(S_{t},a)}\right)$$

---

## *3. Self-play and Training(自我对弈和训练)*

在上一节中，我们根据给定的网络参数 $\theta$ 使用改进的 MCTS 方法完成了策略提升，接下来考虑网络的训练。

*AlphaZero* 使用 *self-play(自我对弈)* 的方式得到采样数据，具体做法是在固定的网络参数 $\theta$ 下构建一颗 MCTS，在每个盘面 $S_{t}$ 下，首先在 MCTS 上进行 *rollout* 得到策略函数 $\pi$，然后根据 $\pi$ 选择该盘面下的行动。

为了保证 MCTS 对盘面的充分探索，我们在选择行动时引入 *dirichlet noise(狄利克雷噪声)* $\eta \sim \operatorname{Dir}(0.03)$，取策略函数

$$\pi^{\prime}(a|s) = (1-\varepsilon)\pi(a|s) +\varepsilon \eta_a$$

来选择落子位置，如此交替落子直至游戏结束，得到该盘面下的真实价值 $z$，如此一次 *self-play* 可以采样出一系列的 $(s_{i},\pi_{i},z_{i})$.

如此，将这些采样轨迹作为 *target(目标)*，得到损失函数，例如

$$L(\theta)=(z-v_{\theta})^2-\pi \ln \pi_{\theta}+\lambda\left\|\theta\right\|$$

随着训练的进行，网络将可以评估每个盘面的价值并选择相应的行动。

神经网络的架构取决于游戏的类型，大多数棋盘游戏都可以使用多层 *CNN* 的架构，在 *DeepMind* 论文中，他们使用了 $20$ 个 *residual blocks(残差块)*，每个残差块中有 $2 $ 个卷积层。

---

## *Reference*

- https://gibberblot.github.io/rl-notes/single-agent/mcts.html
- https://suragnair.github.io/posts/alphazero.html
- https://tjmachinelearning.com/lectures/1819/guest/alphazero/RL_in_AlphaZero.pdf
- https://github.com/initial-h/AlphaZero_Gomoku_MPI/tree/master
