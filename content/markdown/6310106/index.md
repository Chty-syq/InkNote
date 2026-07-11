---
type: markdown
title: 强化学习重学系列(7) Deep Reinforcement Learning
slug: "6310106"
order: 12
date: 2025-02-06
updatedAt: 2026-07-01 01:26:34
tags:
  - 强化学习
published: true
category: machine-learning
---

## *1. Approximate Methods(近似方法)*

我们在前面章节中讲到的 *MC(蒙特卡罗), TD(时序差分)* 等方法，实质上构建了一张关于价值函数 $v_{\pi}(s)$ 的表格。这样的方法只适用于离散状态，并且要求状态空间较小。

当状态的数量非常大的时候，这种做法就不适用了。例如，若状态是一张 $800\times 600$ 的 *RGB* 图像时，一共有 $256^{800\times 600\times 3}$ 种状态，在计算机中存储这个量级的价值函数表是不现实的。

因此我们需要将价值函数 $v_{\pi}(s)$ 近似为参数化的 $\hat{v}(s;\theta)$，例如线性函数，更复杂一点可以是神经网络。

我们需要找到最优的参数 $\theta$ 使得 $\hat{v}(s ; \theta)$ 尽可能的接近真实值 $v_{\pi}(s)$，通常情况下我们取 *MSE* 作为目标函数

$$J(\theta)=\mathbb{E} \left[v_\pi(s)-\hat{v}(s; \theta)\right]^2$$

期望式中的状态 $s$ 满足某种概率分布，例如均匀分布的情况下目标函数就是

$$J(\theta)=\frac{1}{|\mathcal{S}|}\sum_{s\in \mathcal{S}} \left[v_\pi(s)-\hat{v}(s; \theta)\right]^2$$

更普遍的情况下，我们常常要关注 *MDP* 的状态分布。

我们沿用 [强化学习重学系列(8) Bellman Operator](http://blog.leanote.com/post/chty_syq/%E5%BC%BA%E5%8C%96%E5%AD%A6%E4%B9%A0%E9%87%8D%E5%AD%A6%E7%B3%BB%E5%88%97-8-Bellman-Operator) 中的记号，设 $P_{\pi}\in\mathbb{R}^{n \times n}$ 表示状态转移矩阵，其中 $(i,j)$ 位置的元素表示状态 $i$ 走一步转移到 $j$ 的概率，那么 $P_{\pi}^{k}$ 表示 $k$ 步状态转移的概率矩阵。

> **Definition 1. Stationary Distribution(稳态分布).** 在持续型任务中，对于给定的策略 $\pi$，设初始状态分布为 $d_{0}(s)$，若从初始状态出发，经过无限长的状态转移后达到了某个状态不再改变，即
> $$d^{\pi}(s) = \lim _{t \rightarrow \infty} \operatorname{Pr}\left(s_0 \rightarrow s, t, \pi\right)$$ 写成矩阵形式为
$$\lim_{t\rightarrow\infty}P_{\pi}^{t}d_{0} = d_{\pi}$$ 我们称 $d_{\pi}$ 为 *limiting distribution(极限分布)*，而满足 $$P_{\pi}d_{\pi} = d_{\pi}$$ 的分布 $d_{\pi}$ 称为 *stationary distribution(稳态分布)*，可以看到极限分布一定是稳态分布，反之则不成立。

稳态分布说明了在持续型任务中，每个状态 $s$ 的长期访问频率，它和 *on-policy distribution* 是一致的，只不过后者还适用于回合制任务。

现在我们可以使用稳态分布在评估参数 $\theta$ 的表现

$$J(\theta)=\sum_{s \in \mathcal{S}} d_{\pi}(s)\left[v_\pi(s)-\hat{v}(s ; \theta)\right]^2$$

但是在 *model-free* 的情况下，状态转移矩阵 $P_{\pi}$ 是不可知的，此时稳态分布也是未知的，我们通常假设状态是均匀分布的。

假设我们已经采样出了一条轨迹 $$\left(S_0, A_0\right) \xrightarrow{R_1}\left(S_1, A_1\right) \xrightarrow{R_2}\left(S_2, A_2\right) \xrightarrow{R_3}\left(S_3, A_3\right) \cdots$$

结合梯度下降的方法，在状态 $S_{t}$ 下，可以迭代参数

$$\theta \leftarrow \theta - \alpha \nabla\left[v_\pi\left(S_t\right)-\hat{v}\left(S_t;\theta \right)\right]^2$$

其中 $\alpha$ 为步长，梯度可以展开为

$$\nabla\left[v_\pi\left(S_t\right)-\hat{v}\left(S_t ; \theta\right)\right]^2 = 2\left[v_\pi\left(S_t\right)-\hat{v}\left(S_t;\theta\right)\right] \nabla \hat{v}\left(S_t;\theta\right)$$

然而式子中的 $v_{\pi}(S_{t})=\mathbb{E}_\pi\left[G_t | S_t\right]$ 是未知的，我们可以使用 $G_{t}$ 来代替它，因为它是一个无偏估计。

> **Method 2. Gradient Monte Carlo(蒙特卡罗梯度算法).** 对于给定的策略 $\pi$，步长 $\alpha$，对 $\hat{v}(s ; \theta)$ 进行价值评估的算法流程如下：
> 
> 1. 初始化权重 $\theta$
> 2. 枚举 $k = 0, 1,\cdots$
>   - 在策略 $\pi$ 下生成一条轨迹 $$\left(S_0, A_0\right) \xrightarrow{R_1}\left(S_1, A_1\right) \xrightarrow{} \cdots \xrightarrow{} \left(S_{T-1}, A_{T-1}\right) \xrightarrow{R_{T}} \text{Terminal}$$
>   - 初始化 $G_{T} = 0$，逆序枚举 $t = T-1,T-2,\cdots, 0$
>       - 计算折扣收益 $$G_{t} = \gamma G_{t+1} + R_{t+1}$$
>       - 更新权重 $$\theta \leftarrow \theta +\alpha\left[G_t-\hat{v}\left(S_t; \theta\right)\right] \nabla \hat{v}\left(S_t; \theta\right)$$

蒙特卡罗方法需要采样出完整的轨迹，且方差较大，我们考虑 *TD* 方法的迭代方程

$$v_\pi\left(S_t\right) \leftarrow v_\pi\left(S_t\right)+\alpha\left(R_{t+1}+\gamma v_\pi\left(S_{t+1}\right)-v_\pi\left(S_t\right)\right)$$

该方程表明每次迭代后，当前策略下的 $v_{\pi}$ 会向 *TD target* 靠近，我们可以用 *TD target* 作为 $v_{\pi}$ 的估计值。其梯度

$$\begin{aligned}\nabla\left[v_\pi\left(S_t\right)-\hat{v}\left(S_t ; \theta\right)\right]^2
&=\nabla\left[R_{t+1}+\gamma \hat{v}\left(S_{t+1};\theta\right)-\hat{v}\left(S_t ; \theta\right)\right]^2 \\
&=2\left[R_{t+1}+\gamma \hat{v}\left(S_{t+1};\theta\right)-\hat{v}\left(S_t ; \theta\right)\right] \nabla \hat{v}\left(S_t ; \theta\right)
\end{aligned}$$

这里我们忽略了目标值 $\gamma \hat{v}\left(S_{t+1} ; \theta\right)$ 的梯度，只关心估计值 $\hat{v}\left(S_t ; \theta\right)$ 的梯度，因此这是一种 *semi-gradient(半梯度方法)*. 

> **Method 3. Semi-gradient TD(0).** 对于给定的策略 $\pi$，近似函数$\hat{v}(s;\theta)$，步长 $\alpha$，对 $\hat{v}$ 进行价值评估的算法流程如下：
> 
> 1. 初始化权重 $\theta$
> 2. 枚举 $k = 0, 1,\cdots$
>   - 随机选取初始状态 $S_{0}$
>   - 枚举时刻 $t=0,1,\cdots$
>       - 在策略 $\pi(S_{t})$下选取行动 $A_{t}$，得到 $R_{t+1},S_{t+1}$
>       - 更新权重 $$\theta \leftarrow \theta +\alpha\left[R_{t+1} + \gamma \hat{v}\left(S_{t+1} ; \theta\right)-\hat{v}\left(S_t; \theta\right)\right] \nabla \hat{v}\left(S_t; \theta\right)$$

---

## *2. Deep Q-Learning*

我们使用近似方法对 $v_{\pi}(s)$ 进行了价值评估，接下来考虑将其写出 $q_{\pi}(s,a)$ 的形式，并加入策略提升来进行 *TD* 控制

回顾一下 *Q-Learning* 的迭代方程

$$q_\pi\left(S_t, A_t\right) \leftarrow q_\pi\left(S_t, A_t\right)+\alpha\left[R_{t+1}+\gamma \max _a q_\pi\left(S_{t+1}, a\right)-q_\pi\left(S_t, A_t\right)\right]$$

我们用 $\hat{q}(s,a;\theta)$ 来近似 $q_{\pi}$，用 *TD target* 来估计其真实值，得到权重 $\theta$ 的迭代式

$$\theta \leftarrow \theta+\alpha\left[R_{t+1}+\gamma \max _a \hat{q}\left(S_{t+1}, a;\theta \right)-\hat{q}\left(S_t,A_t ; \theta\right)\right] \nabla \hat{q}\left(S_t,A_{t} ; \theta\right)$$


> **Method 4. Semi-gradient Q-Learning.** 对于给定的近似函数 $Q(s,a;\theta)$，步长参数 $\alpha$ 和随机参数 $\epsilon$，控制算法的流程如下
>
> 1. 初始化权重 $\theta$, 策略 $\pi$
> 2. 枚举轨迹标号 $k = 0, 1,\cdots$
>   - 随机选取初始状态 $S_{0}$
>   - 枚举时刻 $t = 0, 1, \cdots$
>       - 在策略 $\pi(S_{t})$ 下选择行动 $A_{t}$，得到 $R_{t+1},S_{t+1}$
>       - 更新权重 $$\theta \leftarrow \theta+\alpha\left[R_{t+1}+\gamma \max _a Q\left(S_{t+1}, a;\theta \right)-Q\left(S_t,A_t ; \theta\right)\right] \nabla Q\left(S_t,A_{t} ; \theta\right)$$
>       - 找到最优行动 $$a^{*} = \arg \max _a Q\left(S_t, a;\theta\right)$$
>       - 进行策略提升 $$\pi\left(a | S_t\right) \leftarrow \begin{cases}1-\varepsilon+\frac{\epsilon}{\left|\mathcal{A}\left(S_t\right)\right|} & \text { if } a=a^* \\ \frac{\epsilon}{\left|\mathcal{A}\left(S_t\right)\right|} & \text { if } a \neq a^*\end{cases}$$

现在我们成功把 *Q-Learning* 拓展为了神经网络的形式，但是其中存在一些问题

- 相关性问题：强化学习里面收集的数据常常是时序的，它们之间的相关性很高，使得学习困难。
- 稳定性问题：网络的训练目标中包含了网络本身的参数，使得梯度下降很不稳定。

> **Method 5. Experience Replay(经验回放)** 为了解决相关性问题，我们使用一个容器 $D$，其中存放了一系列四元组 
> $$(S_{t},A_{t},R_{t},S_{t+1})$$ 在训练的过程中，智能体不停地从环境中采集数据放入容器 $D$ 中，同时从 $D$ 中随机采样，得到相关性较低的样本，进行随机梯度下降更新网络权重。

<div></div>

> **Method 6. Fixed Target(固定目标)** 为了解决稳定性问题，我们令 *Target* 网络参数与近似网络的参数存在一定的时间差，即
> $$\text{TD Target}=R_{t+1}+\gamma \max _{a} Q\left(S_{t+1}, a ; \theta^{-}\right)$$ 其中 $\theta^{-}$ 滞后 $\theta$ 一定的时间，这样能在一定程度上缓解半梯度下降的不稳定问题。

我们给出一个较为直观的解释，想象一下，把要估计的 $\hat{q}(s,a)$ 看做一只猫，把要逼近的目标 *TD Target* 看做是一只老鼠，把半梯度下降看做猫捉老鼠的过程。

现在的问题是猫和老鼠都在移动，这样猫想要捉住老鼠是非常困难的，因为猫瞄准的是一个不断变化的目标，一不小心还会踩中陷阱，上演汤姆和杰瑞的故事。

而我们的解决方案则是让猫沿着老鼠的行动轨迹不断追捕，这样就比较容易抓住老鼠了。

我们将这两种技巧整合到 *method 3* 中得到完整的控制算法。

> **Method 7. Deep Q-Learning.** 对于给定的近似函数 $Q(s,a;\theta)$，步长参数 $\alpha$ 和随机参数 $\epsilon$，控制算法的流程如下
>
> 1. 初始化权重 $\theta,\theta^{-}$，策略 $\pi$，经验回放池 $D$
> 2. 枚举轨迹标号 $k = 0, 1,\cdots$
>   - 随机选取初始状态 $S_{0}$
>   - 枚举时刻 $t = 0, 1, \cdots$
>       - 在策略 $\pi(S_{t})$ 下选择行动 $A_{t}$，得到 $R_{t+1},S_{t+1}$
>       - 将四元组 $(S_{t},A_{t},R_{t+1},S_{t+1})$ 放入 $D$ 中
>       - 在 $D$ 中随机采样得到 $N$ 个样本，枚举样本标号 $i=0,1,\cdots,N-1$
>           - 使用当前样本数据 $(S_{t},A_{t},R_{t+1},S_{t+1})$ 更新权重 $$\theta \leftarrow \theta+\alpha\left[R_{t+1}+\gamma \max _a Q\left(S_{t+1}, a;\theta^{-} \right)-Q\left(S_t,A_t ; \theta\right)\right] \nabla Q\left(S_t,A_{t} ; \theta\right)$$
>           - 找到最优行动 $$a^{*} = \arg \max _a Q\left(S_t, a;\theta\right)$$
>           - 进行策略提升 $$\pi\left(a | S_t\right) \leftarrow \begin{cases}1-\varepsilon+\frac{\epsilon}{\left|\mathcal{A}\left(S_t\right)\right|} & \text { if } a=a^* \\ \frac{\epsilon}{\left|\mathcal{A}\left(S_t\right)\right|} & \text { if } a \neq a^*\end{cases}$$
>   - 更新目标网络权重 $\theta^{-}\leftarrow \theta$

---

## *Reference*

- https://stats.stackexchange.com/questions/400087/how-deriving-the-formula-for-the-on-policy-distribution-in-episodic-tasks
