---
type: markdown
title: 强化学习重学系列(11) Performance Evaluation
slug: "2859686"
order: 7
date: 2025-02-18
updatedAt: 2026-07-08 23:53:01
tags:
  - 强化学习
published: true
category: machine-learning
---

## *1. Value Function Rewrite(重写价值函数)* 

我们回忆一下 MDP 的控制过程，从初始状态 $s_{0}$ 出发，遵循策略 $\pi$ 进行决策得到一条轨迹 $(S_{0},A_{0},\cdots,S_{T},A_{T})$，对应的概率为

$$\mathbb{P}^{\pi}(S_{0},A_{0},\cdots,S_{T},A_{T}) = \prod_{t=0}^{T}\pi(A_{t}|S_{t})\prod_{t=0}^{T-1}P(S_{t+1}|S_{t},A_{t})$$

回忆价值函数的表达式

$$v_\pi(s)=\mathbb{E}_\pi\left[G_t \mid S_t=s\right]=\mathbb{E}_\pi\left[\sum_{k=0}^{\infty} \gamma^k R_{t+k+1} \mid S_t=s\right]$$

它表示了 $t$ 时刻状态 $s$ 下的期望回报，不失一般性的，我们假设 $s$ 为起始状态，得到

$$\begin{aligned}v_\pi(s_{0})
&= \mathbb{E}_\pi\left[\sum_{t=0}^{\infty} \gamma^t R_{t+1} ; s_{0}\right] \\
&= \sum_{A_{0},S_{1},A_{1},\cdots} \mathbb{P}^{\pi}(S_{0},A_{0},S_{1},A_{1},\cdots) \sum_{t=0}^{\infty} \gamma^{t} r(S_{t},A_{t})
\end{aligned}$$

这个展开式略显复杂，我们换一种思考方式，不是枚举轨迹，而是枚举状态动作对 $(S_{t},A_{t})$ 的贡献，从而交换求和号的次序。

首先需要考虑 $(S_{t},A_{t})$ 的访问概率，也就是说从 $s_{0}$ 出发遵循策略 $\pi$ 的设定下，状态动作对 $(s,a)$ 在 $t$ 时刻被访问的概率

$$\begin{aligned}\mathbb{P}_t^\pi\left(s, a ; s_{0}\right) 
&= \sum_{A_{0},S_{1},A_{1},\cdots,S_{t-1},A_{t-1}} \mathbb{P}^\pi(S_{0},A_{0},\cdots,S_{t-1},A_{t-1},s,a)
\end{aligned}$$

这样的话，上面的和式就可以变换为

$$v_\pi(s_{0}) = \sum_{s,a}r(s,a)\sum_{t=0}^{\infty}\gamma^{t}\mathbb{P}_t^\pi\left(s, a ; s_0\right)$$

我们想办法把右边的东西写成一个概率分布，令 

$$d_{s_0}^\pi(s, a)=(1-\gamma) \sum_{t=0}^{\infty} \gamma^t \mathbb{P}_t^\pi\left(s, a ; s_0\right)$$

可以证明它是一个概率分布，我们把它称为 *discounted state-action distribution(折扣状态动作对分布)*，那么

$$v_\pi(s_{0}) = \frac{1}{1-\gamma} \sum_{s, a} d_{s_0}^\pi(s, a) r(s, a) =\frac{1}{1-\gamma} \mathbb{E}_{(s,a)\sim d_{s_0}^\pi}[r(s,a)] $$

我们成功把价值函数写成了一个关于奖励函数 $r(s,a)$ 的期望表达式，这种书写方式在分析强化学习算法的表现中常常用到。

有些时候我们仅关心状态的分布，也就是 $d_{s_0}^\pi(s, a)$ 的边际分布

$$d_{s_0}^\pi(s)=(1-\gamma) \sum_{t=0}^{\infty} \gamma^t \mathbb{P}_t^\pi\left(s ; s_0\right)$$

---

## *2. Performance Difference(性能差异)*

我们定义 *advantage function(优势函数)* 

$$A_{\pi}(s, a)=q_{\pi}(s, a)-v_{\pi}(s)$$

这里的价值函数 $v_{\pi}(s)$ 表达的是在策略 $\pi$ 下状态 $s$ 的所有可能行动的期望价值

$$v_\pi(s)=\sum_a \pi(a | s) q_\pi(s, a)$$

根据定义显然有 $A_{\pi}(s,\pi(s)) = 0$，事实上优势函数评价了选取行动 $a$ 的价值相对于所有行动平均值的大小。我们之前引入 $v_{\pi}(s)$ 作为 *baseline* 的方法，就是把优势函数作为了优化目标。

优势函数可以清晰的度量两个策略的表现差异

> **Theorem 1. Performance Difference Lemma.** 对于策略函数 $\pi_{1},\pi_{2}$，对应的价值函数之差 $$v_{\pi_{1}}(s_{0}) - v_{\pi_{2}}(s_{0})=\frac{1}{1-\gamma} \mathbb{E}_{(s,a)\sim d_{s_{0}}^{\pi_{1}}}\left[A_{\pi_2}(s, a)\right]$$

如图所示，我们的证明思路是把价值函数之差进行分解，图中的曲线$\text{(1)}$表示 $v_{\pi_{1}}(s_{0})$ ，曲线$\text{(3)}$表示 $v_{\pi_{2}}(s_{0})$，曲线$\text{(2)}$则表示从 $s_{0}$ 出发沿 $\pi_{1}$ 策略走一步 $a_{0}$ 后续遵循 $\pi_{2}$ 策略的价值，那么

$$\text{(1)} - \text{(3)} = \text{(1)} - \text{(2)} + \text{(2)} - \text{(3)}$$

这样做的好处是 $\text{(1)} - \text{(2)}$ 的计算和 $\text{(1)} - \text{(3)}$ 如出一辙，可以继续用同样的方法分解，而 $\text{(2)} - \text{(3)}$ 实质上就是优势函数的定义。

<center>![](/content-images/external/79b9f9bd41ab35f7c4e5034717e67f46.jpg)</center>
根据这样的思路，我们写一下证明过程： 

$$\begin{aligned} v_{\pi_{1}}(s_{0}) - v_{\pi_{2}}(s_{0})
&= v_{\pi_{1}}(s_{0}) - \mathbb{E}_{a_{0}\sim\pi_{1},s_{1}\sim P(s_{0},a_{0})}\left[r(s_{0},a_{0}) + \gamma v_{\pi_{2}}(s_{1})\right] + \mathbb{E}_{a_{0}\sim\pi_{1},s_{1}\sim P(s_{0},a_{0})}\left[r(s_{0},a_{0}) + \gamma v_{\pi_{2}}(s_{1})\right] - v_{\pi_{2}}(s_{0}) \\
&= \gamma\mathbb{E}_{s_{1}\sim P(s_{0},a_{0})} \left[v_{\pi_{1}}(s_{1}) - v_{\pi_{2}}(s_{1}) \right] + \mathbb{E}_{a_0 \sim \pi_{1}}[q_{\pi_{2}}(s_{0},a_{0})] - v_{\pi_{2}}(s_{0}) \\
&= \gamma\mathbb{E}_{s_{1}\sim P(s_{0},a_{0})} \left[v_{\pi_{1}}(s_{1}) - v_{\pi_{2}}(s_{1}) \right] +\mathbb{E}_{a_0 \sim \pi_{1}}[A_{\pi_{2}}(s_{0},a_{0})]
\end{aligned}$$

将左边的项不断展开，我们发现状态动作对 $(s_{t},a_{t})$ 的贡献就是 $\gamma^{t}A_{\pi_{2}}(s_{t},a_{t})$，因此

$$v_{\pi_{1}}(s_{0}) - v_{\pi_{2}}(s_{0}) =  \frac{1}{1-\gamma} \mathbb{E}_{(s,a)\sim d_{s_{0}}^{\pi_{1}}}\left[A_{\pi_2}(s, a)\right]$$

这里解释一下，我们做的操作和上一节中变换 $v_{\pi}(s_{0})$ 是一样的，彼时状态动作对 $(s,a)$ 的贡献是 $\gamma^{t} r(s,a)$.

> **Example 2.** 我们展示一个使用 *PDL* 来证明策略迭代 *PI* 的例子，*PI* 方法使用贪心策略进行迭代 $$\pi^{\prime}(s)=\arg \max _a q_{\pi}(s, a)$$ 我们要证明它是 *monotonic improvement(一致提升的)*，即 $$v^{\pi^{\prime}}(s)\geq v^{\pi}(s), \quad \text{for all } s\in \mathcal{S}$$

之前我们是使用策略提升定理来证明它的，现在有了 *PDL* 证明更加简单

$$\begin{aligned}v^{\pi^{\prime}}(s)- v^{\pi}(s)
&= \frac{1}{1-\gamma} \mathbb{E}_{(s,a)\sim d_{s_{0}}^{\pi^{\prime}}}\left[A_{\pi}(s, a)\right] \\
&= \frac{1}{1-\gamma} \mathbb{E}_{s\sim d_{s_{0}}^{\pi^{\prime}}}\left[A_{\pi}(s, \pi^{\prime}(s))\right] \\
&\geq \frac{1}{1-\gamma} \mathbb{E}_{s\sim d_{s_{0}}^{\pi^{\prime}}}\left[A_{\pi}(s, \pi(s))\right]  = 0
\end{aligned}$$

这里的不等式是因为 $$\pi^{\prime}(s)=\arg \max _a q_{\pi}(s, a) = \arg \max _a A_{\pi}(s, a)$$

即最大化价值函数等价于最大化优势，我们通常更关注后者。

---

## *3. Greedy Policy Selector(贪心策略选择)*

根据 *PDL*，我们知道对于初始状态分布 $\mu$ 有

$$v_{\pi^{\prime}} - v_{\pi}=\frac{1}{1-\gamma} \mathbb{E}_{(s,a)\sim d_{\mu}^{\pi^{\prime}}}\left[A_{\pi}(s, a)\right]$$

其中 $d^{\pi}_{\mu}$ 表示 $\mu$ 下的折扣状态动作对分布，如果我们要保证策略 $\pi^{\prime}$ 一致提升，就需要让右边的项尽可能的大。

但是问题来了，新策略 $\pi^{\prime}$ 下的状态分布 $d_{\mu}^{\pi^{\prime}}$ 是未知的。一个自然的想法是如果新旧两个策略相差的不是太远，那么我们可以用旧的状态分布 $d_{\mu}^{\pi}$ 来近似它，即计算

$$\pi^{\prime} = \arg \max _{\pi^{\prime}} \mathbb{E}_{s \sim d_\mu^{\pi}}\left[A^{\pi}(s, \pi^{\prime}(s))\right]$$

我们只需要使用上一节中的策略梯度方法来估计优势函数 $A^{\pi}$ 即可，剩下的问题就是如何保证策略的一致提升。

---

## *4. Conservative Policy Iteration(保守策略迭代)*

为了保证新旧策略下的状态分布相近，我们令

$$\pi_{\text{new}} = \alpha \pi^{\prime} + (1-\alpha) \pi$$

通过引入权重 $\alpha \in [0,1]$ 使得新策略 $\pi_{\text{new}}$ 与旧策略 $\pi$ 的距离保持在一定程度之内，这样的话状态动作对的分布也不会差的太远。

> **Lemma 3.** 对于任意状态 $s\in\mathcal{S}$，有 $$\left\|\pi_{\text{new}}(s) - \pi(s)\right\|_{1} \leq 2\alpha$$

这是一个比较关键的观察结果，证明是不难的 

$$\begin{aligned}\left\|\pi_{\text{new}}(s) - \pi(s)\right\|_{1} 
&= \left\|\alpha\pi^{\prime}(s) - \alpha\pi(s)\right\|_{1} \\
&\leq \alpha \left\|\pi^{\prime}(s)\right\|_{1} + \alpha \left\|\pi(s)\right\|_{1} = 2\alpha
\end{aligned}$$

> **Lemma 4.** 对于两个策略函数 $\pi,\pi^{\prime}$，若  $$\left\|\pi^{\prime}(s) - \pi(s)\right\|_{1} \leq \delta,\quad \text{for all } s \in \mathcal{S}$$ 则对应的状态动作对分布满足 $$\left\|d_{\mu}^{\pi^{\prime}}(s)-d_\mu^{\pi}(s)\right\|_1 \leq \frac{\gamma \delta}{1-\gamma}$$

这个引理给出了状态分布的一个差界，我们将在附录中证明它。结合两个引理有

$$\left\|d_{\mu}^{\pi_{\text{new}}}(s)-d_\mu^{\pi}(s)\right\|_1 \leq \frac{2\gamma \alpha}{1-\gamma}$$

接下来要解决一个至关重要的问题，在这样的设定下新的策略 $\pi_{\text{new}}$ 是否一致提升？

我们定义 *policy advantage(策略优势)*  $$\mathbb{A}_{\pi}(\pi^{\prime})=\mathbb{E}_{s\sim d_\mu^{\pi}}\left[A^{\pi}\left(s, \pi^{\prime}(s)\right)\right]$$

为方便书写，我们在接下来的推导中把 $\mathbb{A}_{\pi}(\pi^{\prime})$ 简写为 $\mathbb{A}$.

策略优势函数刻画了在策略 $\pi$ 对应的状态分布 $d_\mu^{\pi}$ 下，使用 $\pi^{\prime}$ 进行决策的优势程度，根据 *PDL* 有

$$\begin{aligned}(1-\gamma)\left[v^{\pi_{\text{new}}}(s)- v^{\pi}(s)\right]
&= \mathbb{E}_{(s,a)\sim d_{s_{0}}^{\pi_{\text{new}}}}\left[A_{\pi}(s, a)\right]\\
&= \mathbb{E}_{s\sim d_{s_{0}}^{\pi_{\text{new}}}}\left[\alpha A_{\pi}(s, \pi^{\prime}(s))\right] \\
&= \alpha\mathbb{A} + \mathbb{E}_{s\sim d_{s_{0}}^{\pi_{\text{new}}}}\left[\alpha A_{\pi}(s, \pi^{\prime}(s))\right] - \alpha\mathbb{A} \\
&\geq \alpha\mathbb{A} - \frac{\alpha}{1-\gamma}\left\|d_\mu^{\pi_{\text{new}}}-d_\mu^{\pi}\right\|_1 \\
&= \alpha \mathbb{A}-\frac{2 \gamma \alpha^2}{(1-\gamma)^2}
\end{aligned}$$

我们需要逐步解释一下推导过程

1. 我们直接拆解 $a\sim \pi_{\text{new}}(s)$ 得到
$$\begin{aligned}\mathbb{E}_{a\sim \pi_{\text{new}}}\left[A_{\pi}(s, a)\right] 
&= \sum_{a}\alpha\pi^{\prime}(a|s)A_{\pi}(s, a)+\sum_{a}(1-\alpha)\pi(a|s)A_{\pi}(s, a) \\
&= \alpha A_{\pi}(s, \pi^{\prime}(s)) + (1-\alpha)A_{\pi}(s, \pi(s))   \\
&= \alpha A_{\pi}(s, \pi^{\prime}(s))
\end{aligned}$$

2. 我们引入策略优势函数 $\mathbb{A}_{\pi}(\pi^{\prime})$，利用不等式(见附录)
$$|\mathbb{E}_{x\sim p} f(x) - \mathbb{E}_{x\sim q}f(x)| \leq \max_{x}|f(x)|\cdot \left\|p-q\right\|_{1}$$ 进行放缩得到
$$\begin{aligned}\left|\mathbb{E}_{s\sim d_{s_{0}}^{\pi_{\text{new}}}}\left[\alpha A_{\pi}(s, \pi^{\prime}(s))\right] - \alpha\mathbb{A}\right| 
&=  \left|\mathbb{E}_{s\sim d_{s_{0}}^{\pi_{\text{new}}}}\left[\alpha A_{\pi}(s, \pi^{\prime}(s))\right] - \mathbb{E}_{s\sim d_{s_{0}}^{\pi}}\left[\alpha A_{\pi}(s, \pi^{\prime}(s))\right] \right|\\
&\leq \alpha \max_{s} |A_{\pi}(s, \pi^{\prime}(s))| \cdot \left\|d_\mu^{\pi_{\text{new}}}(s)-d_\mu^\pi(s)\right\|_1 \\
&\leq \frac{2 \gamma \alpha^{2}}{1-\gamma} \max_{s} |A_{\pi}(s, \pi^{\prime}(s))| \\
&\leq \frac{2 \gamma \alpha^{2}}{(1-\gamma)^{2}}
\end{aligned}$$ 这里我们假设奖励函数 $r(s,a)\in [0,1]$，那么价值函数
$$0\leq v^{\pi}(s) = \frac{1}{1-\gamma} \mathbb{E}_{(s,a)\sim d_{s_0}^\pi}[r(s,a)] \leq \frac{1}{1-\gamma}$$ 动作价值 $q_{\pi}(s,a)$ 也是一样的，因此式子中的优势函数有上界
$$A_\pi\left(s, \pi^{\prime}(s)\right) = q_{\pi}(s,\pi^{\prime}(s)) - v_{\pi}(s)\leq \frac{1}{1-\gamma}$$

3. 将绝对值去掉取负号的部分代回去得到下界 $\alpha \mathbb{A}-\frac{2 \gamma \alpha^2}{(1-\gamma)^2}$，注意到这是一个关于 $\alpha$ 的二次函数，取 $\alpha=\frac{(1-\gamma)^2 \mathbb{A}}{4 \gamma}$ 得到
$$(1-\gamma)\left[v^{\pi_{\text {new }}}(s)-v^\pi(s)\right] \geq \frac{\mathbb{A}^2(1-\gamma)}{8 \gamma}$$ 当策略优势 $\mathbb{A}> \epsilon$ 时，我们就能保证策略一致提升 $$v^{\pi_{\text {new }}}(s)-v^\pi(s) \geq \frac{\epsilon^2}{8 \gamma} > 0$$

> **Method 5. Conservative Policy Iteration(保守策略迭代).** *CPI* 算法流程如下：
>
> 1. 初始化策略 $\pi(s)$
> 2. 枚举 $k=0,1,2,\cdots$
    - 进行贪心策略选择 $$\pi^{\prime} = \arg \max _{\pi^{\prime}} \mathbb{E}_{s \sim d_\mu^{\pi}}\left[A^{\pi}(s, \pi^{\prime}(s))\right]$$
    - 计算策略优势 $$\mathbb{A}=\mathbb{E}_{s\sim d_\mu^{\pi}}\left[A^{\pi}\left(s, \pi^{\prime}(s)\right)\right]$$
    - 若 $\mathbb{A} \leq\epsilon$，终止迭代
    - 进行增量更新 $$\pi_{\text{new}} = \alpha \pi^{\prime} + (1-\alpha) \pi$$

---

## *Appendix A: Proof of Lemma 4*

> **Lemma 4.** 对于两个策略函数 $\pi,\pi^{\prime}$，若  $$\left\|\pi^{\prime}(s) - \pi(s)\right\|_{1} \leq \delta,\quad \text{for all } s \in \mathcal{S}$$ 则对应的状态动作对分布满足 $$\left\|d_{\mu}^{\pi^{\prime}}(s)-d_\mu^{\pi}(s)\right\|_1 \leq \frac{\gamma \delta}{1-\gamma}$$

证明：首先我们尝试将 $d_{\mu}^{\pi}$ 的表达式

$$d_{\mu}^\pi(s)=(1-\gamma) \sum_{t=0}^{\infty} \gamma^t \mathbb{P}_t^\pi\left(s ; \mu\right)$$

写成矩阵形式，沿用之前的方法，记矩阵 $P_{\pi}$ 的 $(i,j)$ 位置元素表示状态转移 $s_{i}\rightarrow s_{j}$ 的概率，我们知道 $\mathbb{P}_t^\pi\left(s ; \mu\right)$ 表示由初始状态经过 $t$ 步转移到 $s$ 的概率，故 $\mathbb{P}_t^\pi\left(s ; \mu\right) = P_{\pi}^{t}\mu$，因此有

$$\begin{aligned}d^{\pi}_{\mu}
&= (1-\gamma) \sum_{t=0}^{\infty} \gamma^t P_\pi^t \mu = (1-\gamma) \sum_{t=0}^{\infty}\left(\gamma P_\pi\right)^t \mu \\
&= (1-\gamma)\left(I-\gamma P_\pi\right)^{-1} \mu
\end{aligned}$$

记 $G(\pi) = (I-\gamma P_{\pi})^{-1}$，则

$$\begin{aligned}G(\pi^{\prime}) - G(\pi)
&= G(\pi^{\prime}) \left[G^{-1}(\pi) - G^{-1}(\pi^{\prime})\right] G(\pi)\\
&= \gamma G(\pi^{\prime})(P_{\pi^{\prime}} - P_{\pi})G(\pi)
\end{aligned}$$

因此

$$\begin{aligned}d_{\mu}^{\pi^{\prime}}-d_\mu^{\pi}
&= (1-\gamma)\left[G(\pi^{\prime}) - G(\pi)\right] \mu \\
&= (1-\gamma)\gamma G(\pi^{\prime})(P_{\pi^{\prime}} - P_{\pi})G(\pi) \mu \\
&= \gamma G(\pi^{\prime})(P_{\pi^{\prime}} - P_{\pi})d_\mu^{\pi}
\end{aligned}$$

因此 $$\left\|d_{\mu}^{\pi^{\prime}}-d_\mu^{\pi}\right\|_{1} \leq \gamma \left\|G(\pi^{\prime})\right\|_{1} \left\|(P_{\pi^{\prime}} - P_{\pi})d_\mu^{\pi}
\right\|_{1}$$

首先

$$\|G(\pi^{\prime})\|_1=\left\|\left(I-\gamma P_{\pi^{\prime}}\right)^{-1}\right\|_1 \leq \sum_{t=0}^{\infty} \gamma^t\left\|P_{\pi^{\prime}}\right\|_1^t=(1-\gamma)^{-1}$$

其中 $\left\|P_{\pi^{\prime}}\right\|_1=\sum_{s,s^{\prime}}|P_{\pi}(s^{\prime}|s)|=1$，然后

$$\begin{aligned}\left\|(P_{\pi^{\prime}} - P_{\pi})d_\mu^{\pi}
\right\|_{1}
&= \sum_{s,s^{\prime}}\left| \left(P_{\pi^{\prime}}(s|s^{\prime}) - P_{\pi}(s|s^{\prime})\right) d_\mu^{\pi}(s)\right| \\
&\leq  \sum_{s,s^{\prime}}\left|P_{\pi^{\prime}}(s|s^{\prime}) - P_{\pi}(s|s^{\prime})\right| d_\mu^{\pi}(s) \\
&\leq \sum_{s,a,s^{\prime}}P(s^{\prime}|s,a)\left|\pi^{\prime}(a|s)-\pi(a|s)\right| d_\mu^{\pi}(s) \\
&= \sum_{s,a}\left|\pi^{\prime}(a|s)-\pi(a|s)\right| d_\mu^{\pi}(s) \\
&= \sum_{s}\left\|\pi^{\prime}(s)-\pi(s)\right\|_{1} d_\mu^{\pi}(s) \\
& \leq \delta \sum_{s}d_\mu^{\pi}(s) = \delta
\end{aligned}$$

结合起来就是

$$\left\|d_{\mu}^{\pi^{\prime}}(s)-d_\mu^{\pi}(s)\right\|_1 \leq \frac{\gamma \delta}{1-\gamma}$$

---

## *Appendix B: Mean Variation Bound*

> **Lemma 6.** 设 $p(x),q(x)$ 是定义在相同样本空间 $\mathcal{X}$ 上的概率分布，则对于任意有界函数 $f(x)$ 有 
> $$\left|\mathbb{E}_{x \sim p} f(x)-\mathbb{E}_{x \sim q} f(x)\right| \leq \max _x|f(x)| \cdot\|p-q\|_1$$

证明是不难的，设 $\alpha = \max _x|f(x)|$ 为 $|f|$ 的上界，则

$$\begin{aligned}\left|\mathbb{E}_{x \sim p} f(x)-\mathbb{E}_{x \sim q} f(x)\right|
&= \left|\sum_{x} \left(p(x)-q(x)\right)f(x) \right| \\
&\leq \sum_{x} \left|p(x)-q(x)\right|\cdot\left|f(x)\right| \\
&\leq  \alpha \sum_{x} \left|p(x)-q(x)\right| \\
&=\alpha \left\|p-q \right\|_{1}
\end{aligned}$$

---

## Reference

- https://wensun.github.io/CS4789_data/conservative_policy_iteration_Mar_23_annotated.pdf
- https://blog.csdn.net/qq_29745719/article/details/127624285
- https://zhuanlan.zhihu.com/p/445847200
