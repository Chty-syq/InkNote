---
type: markdown
title: 强化学习重学系列(15) Maximum Entropy IRL
slug: 15-maximum-entropy-irl
date: 2026-04-09
updatedAt: 2026-04-09 21:06:11
published: true
category: machine-learning
---

## *1. The Idea of Maximun Entropy*

基于最大化 *margin* 的方法无法解决奖励函数二义性的问题，依然存在多种奖励函数可以解释专家的行为，因此这类方法总会引入一些额外信息，例如假设专家策略遥遥领先。

如何在尽量不引入额外约束的条件下解决二义性问题呢？我们先介绍一下熵的概念。

在概率论中，熵常常用来衡量概率分布的不确定性，且不确定性越高则熵值越大，例如在区间固定时，所有的分布中均匀分布的熵最大，因为均匀分布在固定区间每一点取值的概率都相等，所以从中采样的不确定性最大。

最大熵原理则是指，在学习概率模型时，在所有满足约束的分布中，熵最大的模型就是最好的模型，这是因为通过熵最大所选取的模型，没有对未知的东西做额外的假设，也就是说除了约束条件外，我们不知道它的其他信息。

在正向的强化学习中，对于给定的 *MDP* 和策略 $\pi$，我们可以求出对应的轨迹分布，而在 *ILR* 问题中，我们手上有的东西是专家轨迹。

如果我们能对轨迹分布建立概率模型，那么就能利用专家轨迹进行极大似然估计得到对应的参数值，而最好的建模方式就是利用最大熵原理。

设专家轨迹数据集 $\mathcal{D}=\{\tau_{0},\tau_{1},\cdots,\tau_{M-1}\}$ 中有 $M$ 条专家轨迹，不妨设奖励函数 $r_{\theta}(s,a) = \theta\cdot \phi(s,a)$，我们的目标是建模轨迹分布 $p(\tau)$ 满足

$$\mathbb{E}_{\tau\sim p(\tau)}[r_{\theta}(\tau)] = \frac{1}{M}\sum_{\tau\in \mathcal{D}} r_{\theta}(\tau)$$

也就是说在 $p(\tau)$ 分布下的期望轨迹奖励应匹配我们手上的专家轨迹样本，其中轨迹奖励定义为

$$r_{\theta}(\tau) = \sum_{(s,a)\in\tau}r_{\theta}(s,a)$$

另外还需要限制 $\sum p(\tau) = 1$ 来保证它是一个概率分布，在这样的限制条件下令 $p(\tau)$ 的熵最大，即如下的优化问题

> $$\begin{array}{cl}
\operatorname{maximize} & -\sum_\tau p(\tau) \log p(\tau) \\
\text { s.t. } & \sum_{\tau}p(\tau)r_{\theta}(\tau) = \frac{1}{M}\sum_{\tau\in \mathcal{D}} r_{\theta}(\tau) \\
& \sum_{\tau}p(\tau) = 1
\end{array}$$

我们使用拉格朗日乘子法进行求解，设

$$\mathcal{L}(p, \lambda, \mu) = \sum_\tau p(\tau) \log p(\tau) - \lambda\left(\sum_{\tau}p(\tau) r_\theta(\tau) - \hat{R}_{\mathcal{D}}\right) - \mu\left(\sum_{\tau}p(\tau) - 1\right)$$ 

其中 $\hat{R}_{\mathcal{D}} = \frac{1}{M}\sum_{\tau\in \mathcal{D}} r_{\theta}(\tau)$ 是根据数据集 $\mathcal{D}$ 预先计算好的量，令

$$\frac{\partial \mathcal{L}(p,\lambda,\mu)}{\partial p(\tau)}=\log p(\tau)+1-\lambda r_\theta(\tau)-\mu = 0$$

这里我们对 $p(\tau)$ 求导要求的是对每条轨迹 $\tau$ 的偏导都等于 $0$，解得

$$p(\tau) \propto \exp(r_{\theta}(\tau))$$

因此我们应该把轨迹分布建模为

$$p_{\theta}(\tau) = \frac{1}{Z_{\theta}}\exp(r_{\theta}(\tau))$$

其中 *partition function(配分函数)* $Z_{\theta} = \sum_{\tau}\exp(r_{\theta}(\tau))$ 保证了它是一个概率分布。

接下来我们只需要进行极大似然估计来优化参数 $\theta$ 的值，即

$$\theta^{*} = \max _\theta \log \prod_{\tau \in \mathcal{D}} p\left(\tau\right)$$

我们令目标函数

$$\begin{aligned}J(\theta) 
&= \frac{1}{M}\log \prod_{\tau \in \mathcal{D}} p\left(\tau\right)= \frac{1}{M}\sum_{\tau\in\mathcal{D}}r_{\theta}(\tau) - \log Z_{\theta}
\end{aligned}$$

其中 $M$ 为数据集大小，我们求它的梯度得到

$$\begin{aligned}\nabla_\theta J(\theta) 
&= \frac{1}{M}\sum_{\tau\in\mathcal{D}} \frac{\partial}{\partial\theta}r_{\theta}(\tau) - \frac{1}{Z_{\theta}}\ \frac{\partial}{\partial\theta}Z_{\theta} \\
&= \frac{1}{M}\sum_{\tau\in\mathcal{D}} \phi(\tau) - \frac{1}{Z_{\theta}}\sum_{\tau}\exp \left(r_\theta(\tau)\right) \phi(\tau) \\
&= \hat{\phi}_{E} - \sum_{\tau}p_{\theta}(\tau) \phi(\tau) 
\end{aligned}$$

太妙了，我们得到的梯度中又出现了 $p_{\theta}(\tau)$，注意到 $\phi(\tau)$ 实际上是状态特征的叠加，因此

$$\begin{aligned}\sum_\tau p_\theta(\tau) \phi(\tau)
&=\sum_\tau p_\theta(\tau) \sum_{s \in \tau} \phi(s) \\
&=\sum_s \phi(s) \sum_{\tau} p_\theta(\tau) \cdot \operatorname{count}(s \text { in } \tau) \\
&= \sum_s\phi(s) D(s)
\end{aligned}$$

其中 $D(s)$ 为 *state visitation frequency(状态访问频率)*，它描述了状态 $s$ 在轨迹中的期望访问次数，它依赖于环境本身的状态转移以及策略函数 $\pi$.

剩下的问题就是如何计算 $D(s)$，设 $D(s,t)$ 表示在时刻 $t$ 访问状态 $s$ 的概率，根据 *Bellman* 方程，有

$$\begin{aligned}
D(s^{\prime},t+1) &= \sum_{s} D(s,t)\sum_{a}\pi(a|s)p(s|s^{\prime},a) \\
D(s, 0) &= \mathbb{P}(S_{0} = s) = \mu(s) \\
D(s) &= \sum_{t=0}^{\infty}D(s,t)
\end{aligned}$$

> **Method 1. MaxEnt IRL(最大熵逆强化学习).** 对于专家轨迹数据集 $\mathcal{D}=\{\tau_{0},\tau_{1},\cdots,\tau_{M-1}\}$，算法流程如下：
>
> 1. 初始化奖励函数 $r_\theta$，预计算专家特征均值 $$\hat{\phi}_{E} = \frac{1}{M}\sum_{\tau\in \mathcal{D}} \phi(\tau)$$
> 2. 枚举 $k=0,1,\cdots$
>   - 使用强化学习算法在奖励函数 $r_{\theta}(s,a)$ 下计算策略 $\pi(a|s)$
>   - 在策略 $\pi$ 下计算状态访问频率 $$\begin{aligned}
D(s^{\prime},t+1) &= \sum_{s} D(s,t)\sum_{a}\pi(a|s)p(s|s^{\prime},a) \\
D(s) &= \sum_{t=0}^{\infty}D(s,t)
\end{aligned}$$
>   - 计算梯度 $$\nabla_\theta J(\theta) =  \hat{\phi}_{E} - \sum_{s}\phi(s)D(s)$$
>   - 根据梯度更新参数 $$\theta \leftarrow \theta + \alpha \nabla_\theta J(\theta)$$

最大熵算法成功解决了奖励二义性的问题，但仍有如下的局限性

- 依赖于环境的状态转移已知
- 假设奖励函数为线性形式，这无疑限制了它的表达能力
- 计算过程包含离散的动态规划迭代，不适用于高维复杂任务

---

## *2. Guided Cost Learning*

我们不再假设奖励函数的线性形式，而是用神经网络来建模 $r_{\theta}$，根据最大熵的结论，轨迹分布应建模为

$$p_\theta(\tau)=\frac{1}{Z_\theta} \exp \left(r_\theta(\tau)\right)$$

其中配分函数 

$$Z_\theta=\sum_\tau \exp \left(r_\theta(\tau)\right)$$

在给定的专家轨迹数据集 $\mathcal{D}_{\text{exp}}=\left\{\tau_0, \tau_1, \cdots, \tau_{M-1}\right\}$ 下，进行极大似然估计得到的对数似然函数

$$J(\theta) = \frac{1}{M} \sum_{\tau \in \mathcal{D}_{\text{exp}}} r_\theta(\tau)-\log Z_\theta$$

现在的问题是如何求解 $Z_{\theta}$，直接计算在高维连续空间中肯定行不通，我们介绍一种基于重要性采样的方法。

由于轨迹 $\tau$ 的分布是未知的，我们不妨从一个已知的分布 $q(\tau)$ 中来采样它，那么根据重要性采样的套路，有

$$Z_\theta=\sum_\tau \frac{\exp \left(r_\theta(\tau)\right)\cdot q(\tau)}{q(\tau)} = \mathbb{E}_{\tau\sim q} \left[\frac{\exp \left(r_\theta(\tau)\right)}{q(\tau)}\right]$$

我们从 $q(\tau)$ 中采样轨迹数据集 $\mathcal{D}_{\text{samp}}=\left\{\tau_0, \tau_1, \cdots, \tau_{N-1}\right\}$，那么

$$Z_{\theta}\approx \frac{1}{N}\sum_{\tau\in\mathcal{D}_{\text{samp}}}\frac{\exp \left(r_\theta(\tau)\right)}{q(\tau)}$$

最后的问题就是 $q(\tau)$ 如何确定，我们把它分解为

$$q(\tau)=\mu(s_0) \prod_{t=0}^{\infty} \pi\left(a_t | s_t\right) p\left(s_{t+1} | s_t, a_t\right)$$

不妨假设环境的状态转移是确定性的，即 $p\left(s_{t+1} | s_t, a_t\right)=1$，那么

$$q(\tau)=\mu(s_0) \prod_{t=0}^{\infty} \pi\left(a_t | s_t\right)$$

我们用 *policy gradient* 的方法建模策略函数 $\pi$，就能得到采样所需的轨迹分布 $q(\tau)$，从而更新奖励函数，另一方面，又可以使用 *RL* 算法在新的奖励函数下更新策略 $\pi$，如此循环更新。

> **Method 2. Guided Cost Learning.** 对于给定的专家轨迹数据集 $\mathcal{D}_{\text{exp}}=\{\tau_{0},\tau_{1},\cdots,\tau_{M-1}\}$，算法流程如下：
>
> 1. 初始化奖励函数 $r_\theta$，策略函数 $\pi$，预计算专家特征均值 $$\hat{\phi}_{E} = \frac{1}{M}\sum_{\tau\in \mathcal{D}_{\text{exp}}} \phi(\tau)$$
> 2. 枚举 $k=0,1,\cdots$
>   - 在策略 $\pi$ 下采样得到轨迹数据集 $\mathcal{D}_{\text{samp}}=\left\{\tau_0, \tau_1, \cdots, \tau_{N-1}\right\}$
>   - 对于 $\tau\in\mathcal{D}_{\text{samp}}$，计算轨迹分布 $$q(\tau) = \mu\left(s_0\right) \prod_{t=0}^{\infty} \pi\left(a_t | s_t\right)$$
>   - 计算目标函数 $$J(\theta) =\hat{\phi}_{E}-\log \frac{1}{N} \sum_{\tau \in \mathcal{D}_{\text {samp }}} \frac{\exp \left(r_\theta(\tau)\right)}{q(\tau)}$$
>   - 梯度上升更新参数 $$\theta \leftarrow \theta + \alpha \nabla_\theta J(\theta)$$
>   - 使用 *PG* 算法更新策略 $\pi(a|s)$


---

## *Reference*

- https://cdn.aaai.org/AAAI/2008/AAAI08-227.pdf
- https://www.andrew.cmu.edu/course/10-703/slides/Lecture_IRL_GAIL.pdf
- https://arxiv.org/pdf/1603.00448
- https://github.com/nishantkr18/guided-cost-learning/blob/master/main.py
- https://di-engine-docs.readthedocs.io/zh-cn/latest/12_policies/guided_cost_zh.html
