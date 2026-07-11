---
type: markdown
title: 强化学习重学系列(2) Markov Decision Processes
slug: "7185341"
order: 18
date: 2024-05-30
updatedAt: 2026-07-09 17:02:47
tags:
  - 强化学习
published: true
category: machine-learning
---

## *1. The Agent–Environment Interface(智能体环境接口)*

强化学习任务通常使用 *Markov decision process(马尔可夫决策过程)* 来建模，如图所示

<center>![](/content-images/external/1fb7710337fd07f984b85851202227f8.jpg)</center>

我们将决策者称为 *agent(智能体)*，与之交互的其它东西称为 *environment(环境)*.

智能体根据当前感知到的 *state(状态)* $S_{t}$ 和当前时刻的 *reward(奖励)* $R_{t}$ 执行行动 $A_{t}$，该行动使得环境发生状态转移 $S_{t}\rightarrow S_{t+1}$，同时给予智能体新的奖励 $R_{t+1}$，接着智能体根据新的环境状态与奖励执行下一个行动，循环往复。

而 *policy(策略)* $\pi(A_{t}|S_{t})$ 则描述了智能体的决策机制，这个概率分布告诉了智能体在状态 $S_{t}$ 时要采取何种行动。

智能体不断与环境交互，得到了一段 *trajectory(轨迹)*

$$(S_{0},A_{0}) \xrightarrow{R_{1}} (S_{1},A_{1}) \xrightarrow{R_{2}} (S_{2},A_{2}) \xrightarrow{R_{3}} (S_{3},A_{3}) \cdots$$

在有限 MDP 中，环境的状态集 $\mathcal{S}$ 与奖励集 $\mathcal{R}$ 以及智能体的决策空间 $\mathcal{A}$ 都是有限集合，且在给定上一时刻状态与决策的情况下，下一时刻的状态转移与获得的奖励是一个确定的概率分布，即

$$p\left(s^{\prime}, r | s, a\right) = \mathbb{P}\left(S_t=s^{\prime}, R_t=r | S_{t-1}=s, A_{t-1}=a\right)$$

其中 $s,s^{\prime}\in \mathcal{S}, r\in \mathcal{R},a\in\mathcal{A(s)}$，这是一个概率分布函数，也就是说在给定的状态 $s$ 和行动 $a$ 下，有

$$\sum_{s^{\prime} \in \mathcal{S}} \sum_{r \in \mathcal{R}} p\left(s^{\prime}, r | s, a\right)=1$$

对于给定的分布函数 $p$，我们可以求其边际分布得到状态转移分布函数

$$p\left(s^{\prime} | s, a\right) = \mathbb{P}\left(S_t=s^{\prime} | S_{t-1}=s, A_{t-1}=a\right)=\sum_{r \in \mathcal{R}} p\left(s^{\prime}, r | s, a\right) $$

以及奖励分布函数

$$p\left(r | s, a\right) = \mathbb{P}\left(R_t = r | S_{t-1}=s, A_{t-1}=a\right)=\sum_{s^{\prime} \in \mathcal{S}} p\left(s^{\prime}, r | s, a\right) $$

我们将它的期望记作奖励函数

$$r(s, a) = \mathbb{E}\left[R_t | S_{t-1}=s, A_{t-1}=a\right]=\sum_{r \in \mathcal{R}} r \sum_{s^{\prime} \in \mathcal{S}} p\left(s^{\prime}, r | s, a\right)$$


> **Example 1. Recycling Robot(回收机器人).** 回收机器人的工作是在环境中收集空汽水罐，其搜寻策略是由智能体根据电池的当前电量高低决定的，如图所示
> <center><img src="/content-images/external/262e27177b145c18512a154409c1b0e0.png" alt="图片" width=1000px></center>
> 智能体的状态集为 $\mathcal{S} = \{\text{high}, \text{low}\}$，分别表示高电量和低电量
> 
> - 当智能体位于高电量时，行动空间为 $\mathcal{A}(\text {high})=\{\text {search}, \text {wait}\}$
>   - 主动 *search* 汽水罐将消耗电量，获得一个较高的奖励 $r_{\text{search}}$，且有 $1-\alpha$ 的概率转移到低电量状态
>   - 原地 *wait* 汽水罐不会消耗电量，获得一个较低的奖励 $r_{\text{wait}}$
> - 当智能体位于低电量时，行动空间为 $\mathcal{A}(\text {low})=\{\text {search}, \text {wait}, \text{recharge}\}$
>   - 主动 *search* 汽水罐将消耗电量，
>       - 有 $1-\beta$ 的概率电量耗尽强制返回充电，获得 $-3$ 的惩罚，并转移到高电量状态
>       - 有 $\beta$ 的概率获得一个较高的奖励 $r_{\text{search}}$
>   - 原地 *wait* 汽水罐不会消耗电量，获得一个较低的奖励 $r_{\text{wait}}$
>   - 返回 *recharge* 将转移到高电量状态，不获得奖励

我们的目标是最大化轨迹的总奖励，即在 $t$ 时刻，我们需要最大化 *expected return(期望回报)*

$$G_t = R_{t+1}+R_{t+2}+R_{t+3}+\cdots+R_T$$

其中 $T$ 表示任务结束的最后时刻，也就是我们到达 *terminal state(结束状态)*，当然任务也可能是永不结束的，此时 $T = \infty$.

> **Definition 2.** 在与环境交互的过程中，若智能体能够到达某些 *terminal states(终止状态)*，我们把得到的轨迹称为 *episode(回合)*，对应的任务称为 *episodic task(回合任务)*，与之相对的，*continuing task(持续任务)* 中没有终止状态，智能体与环境的交互不会停止。在数学表现上，我们无需区分这两类任务，因为我们总能通过下面的方法，将回合任务转化为持续任务。
> 
> - **Absorbing states(吸引状态)** 将终止状态视为一种特殊的状态，在该状态下无论采取何种行动都将转移到它自身，也就是说智能体将在此状态中无限停留下去。
> - **Restart states(重启状态)** 将终止状态视为正常状态，智能体到达该状态后，将转移到起始状态重新开始。

在持续任务中，期望回报往往不能收敛，因此我们通常不会简单的把奖励叠加起来，而是引入折扣因子 $\gamma\in [0,1]$ 计算 *discount return(折扣回报)*

$$G_t = R_{t+1}+\gamma R_{t+2}+\gamma^2 R_{t+3}+\cdots=\sum_{k=0}^{\infty} \gamma^k R_{t+k+1}$$

这个回报包含了两部分，执行行动后立刻就能得到的 *immediate reward(即时奖励)* $R_{t+1}$，以及后续行动能够得到的 *future rewards(未来奖励)*.

当 $\gamma \rightarrow 0$ 时，智能体将更注重于即时奖励，变得更为短视，而 $\gamma \rightarrow 1$ 时，智能体则更加着眼于未来。

> **Definition 3.** 一个马尔科夫决策过程 MDP 是一个五元组 $(\mathcal{S},\mathcal{A},\mathcal{R},p, \gamma)$，包括
> 
> - **Sets(集合)**
>   * 有限状态集合 $\mathcal{S}$
>   * 有限行动集合 $\mathcal{A}(s)$，表示状态 $s$ 下的行动空间
>   * 有限奖励集合 $\mathcal{R}(s,a)$，表示 *state-action pair(状态行动对)* $(s,a)$ 下的奖励空间
>   * 折扣因子 $\gamma \in[0,1]$
> - **Model(模型)**
>   * 概率分布函数 $p\left(s^{\prime}, r | s, a\right)$，及其边际分布 $p\left(s^{\prime} | s, a\right), p\left(r | s, a\right)$
>   * 奖励函数 $r(s,a)$ 表示状态行动对 $(s,a)$ 下的期望奖励
> - **Policy(策略)** 
>   * 策略函数 $\pi(a | s)$ 表示状态 $s$ 下的行动策略
> - **Markov property(马尔卡夫性质)**
>   * 当前的状态转移和奖励仅由上一时刻的状态和行动决定，即 $$p\left(s_{t+1},r_{t+1} | s_t, a_t, s_{t-1}, a_{t-1}, \ldots, s_0, a_0\right)=p\left(s_{t+1},r_{t+1} | s_t, a_t\right)$$

强化学习的目标是确定一个 *policy function(策略函数)* $\pi(a | s)$ 使得折扣回报 $G_{t}$ 最大。

为了找到最佳策略，强化学习中有两大流派，分别是 *value-based(基于价值)* 的方法和 *policy-based(基于策略)* 的方法，它们发展出了很多著名的强化学习算法。

在接下来的章节中，我们先介绍基于价值的方法。

---

## *2. Value Functions(价值函数)*

我们定义 *state-value function(状态价值函数)* 为智能体在状态 $s\in\mathcal{S}$ 下执行策略 $\pi(a|s)$ 的期望回报，即

$$v_\pi(s) = \mathbb{E}_\pi\left[G_t | S_t=s\right]=\mathbb{E}_\pi\left[\sum_{k=0}^{\infty} \gamma^k R_{t+k+1} | S_t=s\right]$$

同样的，可以定义 *action-value function(行动价值函数)* 为智能体在状态 $s\in\mathcal{S}$ 下采取行动 $a\in\mathcal{A}(s)$，之后执行策略 $\pi(a|s)$ 的期望回报，即

$$q_\pi(s, a) = \mathbb{E}_\pi\left[G_t | S_t=s, A_t=a\right]=\mathbb{E}_\pi\left[\sum_{k=0}^{\infty} \gamma^k R_{t+k+1} | S_t=s, A_t=a\right]$$

我们考虑两者的关系，如图所示

<center><img src="/content-images/external/44ccfe8d25de34d2ffebd9a58a399eb1.png" width=250></center>

在状态 $s$ 下（图中标记 $s$ 的白色结点），我们通过概率分布 $\pi$ 选择了一个行动 $a$，根据条件期望可以写出

$$v_{\pi}(s) = \sum_{a} \pi(a|s) q_{\pi}(s,a)$$

在状态 $s$ 选择了行动 $a$ 下（图中标记 $a$ 的黑色结点），我们使用全期望公式，根据状态转移函数 $p$ 来累加下一状态 $s^{\prime}$ 的贡献，即

$$\begin{aligned}q_{\pi}(s,a) 
&= \mathbb{E}_\pi\left[R_{t+1}+\gamma G_{t+1} | S_t=s, A_{t}=a\right]\\
&= \sum_{s^{\prime},r} p\left(s^{\prime}, r | s, a\right)\left\{r+\gamma \mathbb{E}_\pi\left[G_{t+1} | S_{t+1}=s^{\prime}\right]\right\} \\
&= \sum_{s^{\prime},r} p\left(s^{\prime}, r | s, a\right)\left\{r+\gamma v_{\pi}(s^{\prime})\right\} \\
\end{aligned}$$

将两者结合起来，可以得到著名的关于 $v_{\pi}$ 的 *Bellman equation(贝尔曼方程)*

$$v_{\pi}(s)=\sum_a \pi(a | s) \sum_{s^{\prime}, r} p\left(s^{\prime}, r | s, a\right)\left[r+\gamma v_\pi\left(s^{\prime}\right)\right]$$

贝尔曼方程描述了相邻状态的价值函数之间的递推关系，在给定的策略 $\pi$ 下，我们可以根据这些递推关系求出每个状态的价值。

> **Example 4. Gridworld(网格).** 如图所示，智能体在 $5\times 5$ 的网格中沿四个方向移动
> <center><img src="/content-images/external/42b6be7eb1eee5b37e4231ebb2ccd0e4.png" width=750></center>
> 获得奖励或惩罚的途径如下:
> 
> - 所有走出边界的行动为无效行动，智能体仍保留当前位置，并获得 $-1$ 点惩罚
> - 所有走出 $A$ 格子的行动会将智能体传送至 $A^{\prime}$，并获得 $10$ 点奖励
> - 所有走出 $B$ 格子的行动会将智能体传送至 $B^{\prime}$，并获得 $5$ 点奖励

假设我们采取的策略是每次等概率的选取一个方向进行移动，即

$$\pi(a|s) = \frac{1}{4}$$

对于这样的策略，我们设置 $\gamma = 0.9$，通过求解贝尔曼方程提供的线性方程组，可以求出每个状态的价值函数，即右图中标注出的数字，参考代码

``` python
import numpy as np

dx = [0, 1, 0, -1]
dy = [1, 0, -1, 0]

def get_state(x, y):
    return x * 5 + y

def get_position(s):
    return s // 5, s % 5

def solve():
    a, b, gamma = np.eye(25), np.zeros(25), 0.9
    for s in range(25):
        x, y = get_position(s)
        if x == 0 and y == 1:
            s_prime = get_state(4, 1)
            a[s, s_prime], b[s] = -gamma, 10
        elif x == 0 and y == 3:
            s_prime = get_state(2, 3)
            a[s, s_prime], b[s] = -gamma, 5
        else:
            for k in range(4):
                x_prime, y_prime = x + dx[k], y + dy[k]
                if x_prime < 0 or x_prime >= 5 or y_prime < 0 or y_prime >= 5:
                    b[s] += -0.25
                    a[s, s] += -0.25 * gamma
                else:
                    s_prime = get_state(x_prime, y_prime)
                    a[s, s_prime] += -0.25 * gamma

    x = np.linalg.solve(a, b)
    x = x.reshape(5, 5)
    print(x)

```

---

## *3. Optimal Policies(最优化策略)*

解决强化学习任务意味着要从长远的角度找到一个取得最大回报的策略，对于 MDP 模型，我们可以衡量一个策略的优秀程度。

定义策略 $\pi(a|s)$ 优于 $\pi^{\prime}(a|s)$ 当且仅当对于所有的状态 $s\in\mathcal{S}$ 有 $v_\pi(s) \geq v_{\pi^{\prime}}(s)$.

我们将最优策略记作 $\pi_*(a|s)$，对应的 *optimal state-value function(最优化状态价值函数)*

$$v_*(s) = \max _\pi v_\pi(s)$$

同样的，可以定义 *optimal action-value function(最优化行动价值函数)*

$$q_*(s, a) = \max _\pi q_\pi(s, a)$$

这样的话，我们就可以通过最大化最优行动价值函数找到最优策略

$$\pi^*(a | s)= \begin{cases}1, & \text { if } a= \mathop{\arg\max}_{a}  q_*(s, a)\\ 0, & \text { otherwise }\end{cases}$$

考虑 $v_{*}(s)$ 与 $q_{*}(s,a)$ 的关系，如图所示

<center><img src="/content-images/external/49b7c90d1155e5f38602ca89ba86340c.png" width=700></center>

在状态 $s$ 下（左图），我们通过最优策略 $\pi_{*}$ 选择了行动 $a$，得到

$$v_*(s)=\max _{a} q_{\pi_*}(s, a)$$

在状态 $s$ 选择了行动 $a$ 后（右图），我们使用全期望公式，根据状态转移函数 $p$ 来累加下一状态 $s^{\prime}$ 的贡献，即

$$\begin{aligned}q_{*}(s,a) 
&= \mathbb{E}_{\pi_{*}}\left[R_{t+1}+\gamma G_{t+1} | S_t=s, A_{t}=a\right]\\
&= \sum_{s^{\prime},r} p\left(s^{\prime}, r | s, a\right)\left\{r+\gamma \mathbb{E}_{\pi_{*}}\left[G_{t+1} | S_{t+1}=s^{\prime}\right]\right\} \\
&= \sum_{s^{\prime},r} p\left(s^{\prime}, r | s, a\right)\left\{r+\gamma v_{\pi}(s^{\prime})\right\} \\
\end{aligned}$$

将两者结合得来就得到了 *Bellman optimality equation(贝尔曼最优化方程)*

$$v_*(s)=\max _a \sum_{s^{\prime}, r} p\left(s^{\prime}, r | s, a\right)\left[r+\gamma v_*\left(s^{\prime}\right)\right]$$

> **Theorem 5. Bellman equation(贝尔曼方程).** 马尔科夫决策过程 $(\mathcal{S},\mathcal{A},\mathcal{R},p, \gamma)$ 在给定的策略 $\pi$ 下，其状态价值函数满足 *Bellman* 方程
> $$v_{\pi}(s)=\sum_a \pi(a | s) \sum_{s^{\prime}, r} p\left(s^{\prime}, r | s, a\right)\left[r+\gamma v_\pi\left(s^{\prime}\right)\right]$$ 在最优决策 $\pi_{*}$ 下，其最优化价值函数满足 *Bellman* 方程
> $$\begin{aligned}
v_*(s)&=\max _a \sum_{s^{\prime}, r} p\left(s^{\prime}, r | s, a\right)\left[r+\gamma v_*\left(s^{\prime}\right)\right]\\
q_*(s, a)&=\sum_{s^{\prime}, r} p\left(s^{\prime}, r | s, a\right)\left[r+\gamma \max _{a^{\prime}} q_*\left(s^{\prime}, a^{\prime}\right)\right]
\end{aligned}$$

对于有限 MDP，最优化 *Bellman* 方程提供了一系列非线性方程组，且拥有唯一解，我们可以使用求解非线性方程组的方法来解出所有的 $v_{*}(s), q_{*}(s,a)$，并根据它们选择每一时刻的行动。

回顾 *example 3* 中的网格问题，我们可以根据贝尔曼方程求解最优的状态价值，以及最优策略函数，结果如图所示

<center><img src="/content-images/external/4a48d9d73fe99629081ffaefd3757856.png" alt="图片" width=1000px></center>

我们用迭代的方法处理公式中的 $\max$，参考代码如下

``` python
def solve_optimal():
    v, v_prime, gamma = np.zeros(25), np.zeros(25), 0.9
    for epoch in range(1000):
        for s in range(25):
            x, y = get_position(s)
            if x == 0 and y == 1:
                v_prime[s] = 10.0 + gamma * v[get_state(4, 1)]
            elif x == 0 and y == 3:
                v_prime[s] = 5.0 + gamma * v[get_state(2, 3)]
            else:
                temp = np.zeros(4)
                for k in range(4):
                    x_prime, y_prime = x + dx[k], y + dy[k]
                    if x_prime < 0 or x_prime >= 5 or y_prime < 0 or y_prime >= 5:
                        s_prime, reward = s, -1
                    else:
                        s_prime, reward = get_state(x_prime, y_prime), 0
                    temp[k] = reward + gamma * v[s_prime]
                v_prime[s] = np.max(temp)
        v = copy.deepcopy(v_prime)

    v = v.reshape(5, 5)
    print(v)
```

我们通过研究最优价值函数和最优策略，解决了最开始提出的强化学习问题，但是在实践中它们并不好用，这是因为我们需要求解的非线性方程组有 $|\mathcal{S}|$ 个，而在大部分问题中，状态数 $|\mathcal{S}|$ 是极大的，甚至可以无穷多。
