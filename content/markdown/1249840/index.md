---
type: markdown
title: 强化学习重学系列(14) Inverse Reinforment Learning
slug: "1249840"
order: 6
date: 2025-04-23
updatedAt: 2026-07-01 01:26:46
tags:
  - 模仿学习
  - 强化学习
published: true
category: machine-learning
---

## *1. Introduction*

逆强化学习是另一类重要的模仿学习方法，与 *BC* 算法不同，*IRL* 不直接学习策略，而是先从专家轨迹中推断奖励函数，然后再使用强化学习方法来求最优策略。

*IRL* 的主要思想是，专家策略之所以能够做出好的行为，是因为他们优化了一个未知的奖励函数，因此我们可以从专家轨迹中学习这个未知的奖励函数 $r(s,a)$，使得专家策略 $\pi_{E}$ 在该奖励函数下的期望累积回报最大，即

$$r^*(s,a)=\arg \max _{r} \mathbb{E}_{\pi_E}\left[\sum_{t=0}^{\infty} \gamma^t r\left(s_t, a_t\right)\right]$$

通过推断奖励函数的方式，智能体能够适应实际环境中的状态分布，从而有效缓解 *distribution shift* 问题。

然而专家轨迹所对应的奖励函数并不是唯一的，也就是说有大量的奖励函数满足上面的式子，因此 *IRL* 算法的一大难点是解决 *reward ambiguity(奖励二义性)* 的问题。

我们形式化的描述一下 *IRL* 问题

> **Definition 1. IRL.** 设专家策略 $\pi_{E}$ 与环境的交互建模为未知奖励函数的 *MDP*，我们有专家轨迹数据集 
> $$\mathcal{D}=\left(s_i, a_i\right)_{i=1}^M \sim d^{\pi_{E}}$$ 我们的目标是找到奖励函数 $r(s,a)$ 使得在该奖励下专家轨迹的期望回报最大，*IRL* 的算法模板如下
> 
> 1. 将专家轨迹建模为奖励未知的 *MDP*
> 2. 初始化奖励函数的参数
> 3. 使用当前奖励函数求解 *MDP* 得到当前最优策略 $\hat{\pi}$
> 4. 通过最小化 $\hat{\pi}, \pi_{E}$ 的差异更新参数

---

## *2. Margin Optimization(边际优化)*

还记得 *MDP* 的价值函数满足贝尔曼方程

$$v_\pi(s)=\sum_a \pi(a | s) \sum_{s^{\prime}, r} p\left(s^{\prime}, r | s, a\right)\left[r+\gamma v_\pi\left(s^{\prime}\right)\right]$$

为了解释说明的清晰，我们假设奖励函数仅与状态有关，与动作无关，即 $r(s,a)=r(s)$，则

$$v_\pi(s)=r(s) + \gamma \sum_a \pi(a | s) \sum_{s^{\prime}} p\left(s^{\prime} | s, a\right) v_\pi\left(s^{\prime}\right)$$

写成矩阵形式

$$v_\pi = r +\gamma P_\pi v_\pi$$

其中 $P_{\pi}(s^{\prime}|s)$ 表示策略 $\pi$ 下的状态转移矩阵。

> **Theorem 2.** 对于有限状态 *MDP* 下的任意状态 $s\in\mathcal{S}$，策略 $\pi(s)$ 是最优的当且仅当奖励函数 $r(s)$ 满足
> $$(P_{\pi}-P_{a})(I-\gamma P_{\pi})^{-1}r \succeq 0,\quad  \forall a\neq \pi(s)$$ 其中 $\succeq$ 表示逐项大于，$\gamma \in (0,1)$.

证明：在 *value-based* 方法中，我们选择的最优策略是贪心策略，因此最优策略 $\pi$ 必然满足

$$\pi(s) = \arg \max _{a} q_{\pi}(s, a)$$

根据 *Bellman* 方程 

$$q_{\pi}(s,a) = r(s) + \gamma\sum_{s^{\prime}}p(s^{\prime}|s,a)v_{\pi}(s^{\prime})$$

可以把它写成 $v_{\pi}(s)$ 的形式

$$\pi(s) = \arg \max _{a} \sum_{s^{\prime}}p(s^{\prime}|s,a)v_{\pi}(s^{\prime})$$

这等价于

$$\sum_{s^{\prime}}p(s^{\prime}|s,\pi(s))v_{\pi}(s^{\prime})\geq \sum_{s^{\prime}}p(s^{\prime}|s,a)v_{\pi}(s^{\prime}),\quad \forall s \in S, a \neq \pi(s)$$

这个式子展示了一步状态转移过程中策略 $\pi$ 的优越性，把它写成矩阵形式

$$P_{\pi}v_{\pi} \succeq P_{a}v_{\pi}, \quad \forall a\neq \pi(s)$$

根据贝尔曼方程的矩阵形式，我们知道

$$v_{\pi} = (I-\gamma P_{\pi})^{-1}r $$

因此代入进去就得到了

$$(P_{\pi}-P_{a})(I-\gamma P_{\pi})^{-1}r \succeq 0,\quad  \forall a\neq \pi(s)$$

---

*Theorem 2* 的价值在于，它给出了由专家策略推断奖励函数的一个冲要条件，然而满足此条件的 $r(s)$ 有很多，如何在里面选出一个最好的呢？

比较自然的想法是专家策略应该尽可能的比其它策略好的多，就像一场考试中状元的实力远远高于榜眼探花一样，我们选择的奖励函数应当最大化专家策略与次优策略的差距，令专家策略遥遥领先。

用强化学习的语言来说，我们要最大化的是

$$\text { maximize } \sum_{s \in S}\left(q_{\pi}\left(s, \pi(s)\right)-\max _{a \neq \pi(s)} q_{\pi}(s, a)\right)$$

稍作变形得到

$$\text { maximize } \sum_{s \in S}\min_{a \neq \pi(s)}\left(q_{\pi}\left(s, \pi(s)\right)- q_{\pi}(s, a)\right)$$

利用 *Bellman* 方程展开，并把它写成矩阵形式得到

$$\text { maximize } \sum_{s \in S}\min_{a \neq \pi(s)} (P_{\pi}(s) - P_{a}(s))(I-\gamma P_{\pi})^{-1}r$$

我们引入 $\ell_{1}$ 正则项来约束 $r$ 的模长，以及 $r_{\text{max}}$ 来约束每项奖励的边界，得到一个优化问题

> $$\begin{array}{cl}
\text{maximize} &  \sum_{s \in S}\min_{a \neq \pi(s)} \left\{(P_{\pi}(s) - P_{a}(s))(I-\gamma P_{\pi})^{-1}r\right\} - \lambda \left\|r\right\|_{1}\\
\text { s.t. } & (P_{\pi}-P_{a})(I-\gamma P_{\pi})^{-1}r \succeq 0,\quad  \forall a\neq \pi(s) \\
& |r(s)| \leq r_{\max},\quad \forall s\in \mathcal{S}
\end{array}$$

解这个优化问题，我们就能得到最优策略 $\pi$ 对应的奖励函数 $r(s)$，不过在此之前，我们需要把它处理成标准形式。

首先处理目标函数中的 $\min$ 操作，设 $M(s)$ 表示专家动作 $\pi(s)$ 相较于其它动作的最小优势

$$M(s) = \min_{a\neq \pi(s)} (P_{\pi}(s) - P_{a}(s))(I-\gamma P_{\pi})^{-1}r$$

同时需要添加约束条件

$$M(s) \leq (P_{\pi}(s) - P_{a}(s))(I-\gamma P_{\pi})^{-1}r, \quad \forall a\neq \pi(s)$$

其次需要处理 $\left\|r\right\|_{1}=\sum_{s} |r(s)|$ 项，我们引入向量 

$$u(s)\geq |r(s)|$$

作为约束，那么最小化 $\left\|r\right\|_{1}$ 就等价于最小化 $\sum_{s}u(s)$，我们引入了向量 $M,u$ 将优化问题写成了标准形式

> $$\begin{array}{cl}
\text{maximize} &  \sum_{s \in S} \left(M(s) - \lambda u(s)\right)\\
\text { s.t. } & -(P_{\pi}-P_{a})(I-\gamma P_{\pi})^{-1}r \leq 0,\quad  \forall a\neq \pi(s) \\
& - (P_{\pi} - P_{a})(I-\gamma P_{\pi})^{-1}r + M\leq 0, \quad \forall a\neq \pi(s) \\
& -u + r \leq 0 \\
& -u - r \leq 0 \\
& -r \leq  r_{\max} \\
& r \leq  r_{\max}
\end{array}$$

写成矩阵形式为

> $$\begin{array}{cl}
\text{maximize} &  \left[\begin{array}{c}
\mathbf{0} \\
\mathbf{1} \\
-\lambda \mathbf{1}
\end{array}\right]^{T} \left[\begin{array}{c}
\boldsymbol{r} \\
\boldsymbol{M} \\
\boldsymbol{u}
\end{array}\right]\\
\text { s.t. } & \left[\begin{array}{ccc}
-\left(\boldsymbol{P}_{\pi}-\boldsymbol{P}_a\right)\left(\boldsymbol{I}-\gamma \boldsymbol{P}_{\pi}\right)^{-1} & \mathbf{0} & \boldsymbol{0} \\
-\left(\boldsymbol{P}_{\pi}-\boldsymbol{P}_a\right)\left(\boldsymbol{I}-\gamma \boldsymbol{P}_{\pi}\right)^{-1} & \boldsymbol{I} & \mathbf{0} \\
-\boldsymbol{I} & \mathbf{0} & -\boldsymbol{I} \\
\boldsymbol{I} & \mathbf{0} & -\boldsymbol{I}
\end{array}\right] \left[\begin{array}{c}
\boldsymbol{r} \\
\boldsymbol{M} \\
\boldsymbol{u}
\end{array}\right] \leq 0 \\
& \left[\begin{array}{ccc}
-\boldsymbol{I} & \mathbf{0} & \mathbf{0} \\
\boldsymbol{I} & \mathbf{0} & \mathbf{0}
\end{array}\right] \left[\begin{array}{c}
\boldsymbol{r} \\
\boldsymbol{M} \\
\boldsymbol{u}
\end{array}\right] \leq r_{\max}
\end{array}$$

我们使用例如 `cvxpy` 这样的库解这个线性优化问题就能得到奖励函数 $r(s)$，从推导过程不难看出，这种方法有如下局限性

- 依赖于环境的状态转移 $p(s^{\prime},r|s,a)$ 已知
- 计算复杂，受状态数 $|\mathcal{S}|$ 的限制，仅适用于低维状态
- 没有解决奖励函数二义性问题，难以处理次优的专家策略

---

## *3. Apprenticeship Learning(学徒学习)*

为了解决状态复杂度的问题，我们假设奖励函数有如下形式

$$r(s) = w \cdot\phi(s)$$

其中权重参数 $\left\|w\right\|\leq 1$，而 $\phi(s)$ 表示状态 $s$ 的特征表示，也就是说我们认为奖励函数仅与状态特征有关。在这样的假设下，我们可以把价值函数写成

$$v_{\pi}(s) = \mathbb{E}_{\pi}\left[\sum_{t=0}^{\infty} \gamma^t r\left(s_t\right) \right] = w\cdot \mathbb{E}_{\pi}\left[\sum_{t=0}^{\infty} \gamma^t \phi\left(s_t\right) \right]$$

我们记 *feature expectation(特征期望)* 函数

$$\mu(\pi) = \mathbb{E}_{\pi}\left[\sum_{t=0}^{\infty} \gamma^t \phi\left(s_t\right) \right]$$

假设我们有专家轨迹数据集 $\mathcal{D}=\left\{s_0^{(i)}, s_1^{(i)}, \ldots\right\}_{i=1}^M$，其中 $M$ 为轨迹数量，可以用均值来估计专家特征期望

$$\hat{\mu}_{E} = \sum_{i=1}^{M}\sum_{t=0}^{\infty}\gamma^t \phi\left(s^{(i)}_t\right)$$

我们的目标是找到参数 $w$ 使得该奖励函数下的策略特征期望尽可能的接近专家特征期望，即

$$\max_{w:\left\|w\right\|_{2}\leq 1} \min_{\pi\in\Pi} w^{T} (\hat{\mu}_{E} - \mu(\pi))$$

我们引入松弛向量 $t$ 把它写成标准形式

> $$\begin{array}{cl}
\operatorname{maximize} & t \\
\text { s.t. } & t \leq w^{T} (\hat{\mu}_{E} - \mu(\pi)), \quad \forall \pi \in \Pi \\
& \left\|w\right\|_{2} \leq 1
\end{array}$$

然而其中还是有非线性约束 $\left\|w\right\|_{2}$，我们仔细观察一下这个优化问题。

目标函数只和 $t$ 有关，而 $w$ 虽然有模长的限制，但方向可以是任意的，那么为了让 *margin* 最大，肯定要取 $\hat{\mu}_{E} - \mu(\pi)$ 平行的方向，且要取到最大模长 $1$，因此

$$\pi^{*} = \arg\min_{\pi\in\Pi} \frac{(\hat{\mu}_{E} - \mu(\pi))^{T}(\hat{\mu}_{E} - \mu(\pi))}{\left\|\hat{\mu}_{E} - \mu(\pi)\right\|_{2}} =\arg\min_{\pi} \left\|\hat{\mu}_{E} - \mu(\pi)\right\|_{2}$$


> **Method 3. Apprenticeship Learning.** 对于专家特征期望 $\hat{\mu}_{E}$，使用学徒学习估计奖励参数 $w$ 以及对应策略 $\pi$ 的算法流程如下
> 
> 1. 初始化策略池 $\Pi = \{\pi_{0}\}$
> 2. 枚举迭代次数 $k = 1,2,\cdots$
>   - 在策略池中取出 *margin* 最小的策略，其中 $\mu(\pi)$ 的值可以通过蒙特卡罗采样计算$$\pi^{*}= \arg\min_{\pi} \left\|\hat{\mu}_{E} - \mu(\pi)\right\|_{2}$$ 
>   - 计算对应的奖励权重 $$w^{*} = \frac{\hat{\mu}_{E} - \mu(\pi^{*})}{\left\|\hat{\mu}_{E} - \mu(\pi^{*})\right\|_{2}}$$
>   - 若最小 *marigin* 满足 $\left\|\hat{\mu}_E-\mu(\pi^{*})\right\|_2\leq\epsilon$，终止迭代
>   - 在奖励函数 $r(s) = w^{*}\cdot \phi(s)$ 下使用强化学习算法计算最优策略 $\pi_{k}$，并将其加入策略池 $\Pi$

我们通过迭代的方法，不断缩小与专家特征期望间的 *margin(间隔)*，最终得到的参数 $w$ 保证了

$$\begin{aligned}|v_{\pi_{E}}(s) - v_\pi(s)| 
&= |w^{T}(\hat{\mu}_E-\mu(\pi))| \\
&\leq \left\|w\right\|_{2} \left\|\hat{\mu}_E-\mu(\pi)\right\|_{2} \leq \epsilon
\end{aligned}$$

我们看到学徒学习通过假设奖励函数的线性形式，能够解决状态数庞大，甚至无限状态的问题，且不依赖于专家策略最优，也不依赖于环境的状态转移已知。

但是每次迭代时需要求解 *MDP*，计算成本较高，且奖励函数的表达能力受限于线性形式。

---

## *Reference*

- https://ai.stanford.edu/~ang/papers/icml00-irl.pdf
- https://blog.csdn.net/tyhj_sf/article/details/85863219
- https://github.com/MatthewJA/Inverse-Reinforcement-Learning/blob/master/irl/linear_irl.py
- https://ai.stanford.edu/~ang/papers/icml04-apprentice.pdf
- https://blog.csdn.net/weixin_44044411/article/details/119852019
- https://zhuanlan.zhihu.com/p/441545537
- https://alger.au/pdfs/irl.pdf
