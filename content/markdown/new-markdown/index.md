---
type: markdown
title: Generative Adversarial Imitation Learning
slug: 3187429
order: 2
date: 2026-04-08
updatedAt: 2026-06-14 11:53:25
published: true
category: machine-learning
---

## 1. *Characterizing the Induced Optimal Policy*

在之前的文章 [Maximum Entropy IRL](http://blog.leanote.com/post/chty_syq/%E5%BC%BA%E5%8C%96%E5%AD%A6%E4%B9%A0%E9%87%8D%E5%AD%A6%E7%B3%BB%E5%88%97-15-Maximum-Entropy-IRL) 中，我们利用最大熵原理，将轨迹分布建模为 *Boltzmann distribution(玻尔兹曼分布)*

$$p_{\theta}(\tau) = \frac{1}{Z_{\theta}}\exp(c_{\theta}(\tau))$$

然后进行极大似然估计，来优化参数 $\theta$ 的值。本篇中我们使用符号 $c$ 来表示奖励函数，用来区分其与真实奖励函数。

现在我们从策略的角度来重新审视这个问题，对于给定的专家策略 $\pi_{E}$，我们的目标是找到一个策略 $\pi$，在匹配专家特征的同时最大化 $\pi$ 的熵，即

> $$\begin{array}{cl}
\operatorname{maximize} & -\mathbb{E}_{\pi} \log \pi(a | s)\\
\text { s.t. } & \mathbb{E}_{\pi} \phi(s, a)=\mathbb{E}_{\pi_{E}} \phi(s, a)
\end{array}$$

设 $H(\pi) = -\mathbb{E}_{\pi} \log \pi(a | s)$，根据广义拉格朗日乘子法，我们可以得到如下的 *max-min* 问题

$$\underset{r \in \mathbb{R}^{\mathcal{S} \times \mathcal{A}}}{\operatorname{maximize}}\left(\min _{\pi \in \Pi}-H(\pi)+\mathbb{E}_\pi[c(s, a)]\right)-\mathbb{E}_{\pi_E}[c(s, a)]$$

其中 $\mathbb{R}^{\mathcal{S} \times \mathcal{A}}=\{c: \mathcal{S} \times \mathcal{A} \rightarrow \mathbb{R}\}$ 表示全体奖励函数集合，内部的最小化问题本质上是在做一个类强化学习问题，即在给定的 $c(s,a)$ 下计算

$$\mathrm{RL}(c)=\underset{\pi \in \Pi}{\arg \min }-H(\pi)+\mathbb{E}_\pi[c(s, a)]$$

可以使用 *soft value iteration(软价值迭代)* 的那套理论进行求解，我们不在这里阐述求解过程。

而在外层的 *IRL* 求解过程中，为了防止奖励函数过拟合，我们引入一个凸函数 $\psi(c)$ 作为正则项，记

$$\operatorname{IRL}\left(\pi_E\right)=\underset{c \in \mathbb{R}^{\mathcal{S} \times \mathcal{A}}}{\arg \max }\left(\min _{\pi \in \Pi}-H(\pi)+\mathbb{E}_\pi[c(s, a)]\right)-\mathbb{E}_{\pi_E}[c(s, a)]-\psi(c)$$
 
不妨设 $$L(\pi, c) = -H(\pi)-\psi(c)+\mathbb{E}_\pi[c(s, a)] - \mathbb{E}_{\pi_E}[c(s, a)]$$

那么

$$\operatorname{IRL}\left(\pi_E\right) = \underset{c}{\arg \max }\underset{\pi \in \Pi}{\min } L(\pi,c)$$
 
 
为了接下来的推导，我们需要补充一些前置知识。

> **Definition 1. Occupancy Measure(占用率).** 在初始状态分布 $\mu$ 和策略 $\pi$ 下，定义状态动作对 $(s,a)$ 的占用率 
> $$\nu_\mu^\pi(s, a) = \sum_{t=0}^{\infty} \gamma^t \mathbb{P}_\mu^\pi\left(S_t=s, A_t=a\right)$$ 

可以看出占用率的定义和折扣状态动作对分布息息相关 

$$\nu_\mu^\pi(s, a) = \frac{1}{1-\gamma}d^{\pi}_{\mu}(s,a)$$

相应的，价值函数可以表达为

$$v_{\pi}(\mu) = \frac{1}{1-\gamma} \sum_{s, a} d_{\mu}^\pi(s, a) r(s, a)=\sum_{s, a} \nu_{\mu}^\pi(s, a) r(s, a) = \left\langle\nu_\mu^\pi, c\right\rangle$$

如此定义的占用率不再是一个概率分布函数，但在一些场合下可以使理论分析更为简洁。

> **Theorem 2.** 策略 $\pi$ 与占用率 $\nu^{\pi}_{\mu}$ 是一一对应的关系，且 $$\pi(a|s) = \frac{\nu^{\pi}_{\mu}(s,a)}{\sum_{a^{\prime}}\nu^{\pi}_{\mu}(s,a^{\prime})}$$

证明是不难的，首先展开占用率表达式得到

$$\begin{aligned}\nu_\mu^\pi(s, a)
&= \sum_{t=0}^{\infty} \gamma^t \mathbb{P}_\mu^\pi\left(S_t=s, A_t=a\right) \\
&= \mu(s)\pi(a|s) + \sum_{t=0}^{\infty} \gamma^{t+1} \mathbb{P}_\mu^\pi\left(S_{t+1}=s, A_{t+1}=a\right) \\
&= \mu(s)\pi(a|s) + \sum_{t=0}^{\infty} \gamma^{t+1} \sum_{s^{\prime},a^{\prime}}\mathbb{P}_\mu^\pi\left(S_{t+1}=s, A_{t+1}=a, S_{t}=s^{\prime},A_{t}=a^{\prime}\right) \\
&= \mu(s)\pi(a|s) + \sum_{t=0}^{\infty} \gamma^{t+1} \sum_{s^{\prime},a^{\prime}}\mathbb{P}_\mu^\pi\left( S_{t}=s^{\prime},A_{t}=a^{\prime}\right)\mathbb{P}(s|s^{\prime},a^{\prime})\pi(a|s) \\
&= \mu(s)\pi(a|s) + \gamma\pi(a|s) \sum_{s^{\prime},a^{\prime}}\mathbb{P}(s|s^{\prime},a^{\prime})\sum_{t=0}^{\infty} \gamma^{t}\mathbb{P}_\mu^\pi\left( S_{t}=s^{\prime},A_{t}=a^{\prime}\right) \\
&= \mu(s)\pi(a|s) + \gamma\pi(a|s) \sum_{s^{\prime},a^{\prime}}\mathbb{P}(s|s^{\prime},a^{\prime})\nu_\mu^\pi(s^{\prime}, a^{\prime})
\end{aligned}$$

因此

$$\pi(a|s) = \frac{\nu_\mu^\pi(s, a)}{\mu(s) + \gamma \sum_{s^{\prime},a^{\prime}}\mathbb{P}(s|s^{\prime},a^{\prime})\nu_\mu^\pi(s^{\prime}, a^{\prime})}$$

两边对行动 $a$ 求和得到

$$1 = \frac{\sum_{a}\nu_\mu^\pi(s, a)}{\mu(s) + \gamma \sum_{s^{\prime},a^{\prime}}\mathbb{P}(s|s^{\prime},a^{\prime})\nu_\mu^\pi(s^{\prime}, a^{\prime})}$$

代入回去就得到了

$$\pi(a | s) = \frac{\nu_\mu^\pi(s, a)}{\sum_{a^{\prime}} \nu_\mu^\pi(s, a^{\prime})}$$

接下来我们介绍这篇 *paper* 的核心定理

> **Theorem 3.** 
$$\operatorname{RL} \circ \operatorname{IRL}\left(\pi_E\right)=\arg \min _{\pi \in \Pi}-H(\pi)+\psi^*\left(\nu_\mu^\pi-\nu_\mu^{\pi_{E}}\right)$$

其中 $\circ$ 表示复合运算，这个定理告诉我们，逆强化学习本质上在寻找一个策略 $\pi$， 使得其占用率 $\nu_\mu^\pi$ 尽可能接近专家策略的占用率 $\nu_\mu^{\pi_{E}}$，且它们之间的距离可以用 $\psi$ 的凸共轭函数 $\psi^{*}$ 来衡量。

我们尝试证明它，设

$$\tilde{c} = \operatorname{IRL}\left(\pi_E\right), \quad\tilde{\pi}= \operatorname{RL}(\tilde{c})=\operatorname{RL} \circ \operatorname{IRL}_\psi\left(\pi_E\right)$$

首先我们解决一下 $\psi^*$ 的问题，按照凸共轭的定义，有

$$\begin{aligned}\psi^*\left(\nu_\mu^\pi-\nu_\mu^{\pi_E}\right) 
&= \max _c -\psi(c)+\sum_{s, a}\left(\nu_\mu^\pi(s,a)-\nu_\mu^{\pi_E}(s,a)\right) c(s, a) \\
&= \max _c-\psi(c)  + \mathbb{E}_\pi[c(s, a)]-\mathbb{E}_{\pi_E}[c(s, a)]
\end{aligned}$$

所以定理右边的东西其实就是在算

$$\pi_{A} = \arg \min _{\pi} \max _c L(\pi,c)$$

我们只需要证明 $\tilde{\pi}=\pi_{A}$ 即可，而

$$\begin{aligned}
& \tilde{c} = \arg \max_{c} \min _{\pi} L(\pi, c) \\
& \tilde{\pi} =\arg \min_{\pi} L(\pi, \tilde{c})
\end{aligned}$$

在附录中我们会证明策略函数 $\pi$ 的因果熵 $H(\pi)$ 是严格凸函数，再加上 $\psi$ 也是凸函数，因此 $L(\pi,c)$ 对于 $\pi,c$ 均是凸函数，根据对偶定理有

$$\min _{\pi} \max _c L(\pi, c) = \max _c \min _\pi L(\pi, c)$$

因此 $(\pi_{A},\tilde{c})$ 是凸函数 $L$ 的鞍点，因此

$$\pi_{A} = \arg \min_{\pi} L(\pi, \tilde{c})$$

再一次根据 $L$ 的严格凸性，其最小值点必定是唯一的，因此 $\pi_{A} = \tilde{\pi}$，证毕。

---

## *2. Practical Occupancy Measure Matching*

从 *Theorem 3* 的证明过程中，我们可以看到 ***IRL* 与占用率匹配互为对偶问题**，传统的 *IRL* 算法总是在内循环中不断求解 *RL* 问题来复原奖励函数，而现在我们可以直接求解占用率匹配问题来寻找最优策略。

另一方面，共轭函数 $\psi^*$ 度量了占用率之间的差距，不同的正则函数 $\psi$ 对应着不同的 *IRL* 算法，我们举一些例子来说明这点。

> **Example 4.** 若 $\psi$ 为常函数，则
> $$\mathrm{RL} \circ \operatorname{IRL}\left(\pi_E\right) = \pi_{E}$$

根据 *Theorem 3*，当 $\psi$ 是常函数时

$$\mathrm{RL} \circ \operatorname{IRL}\left(\pi_E\right) = \arg \min _{\pi \in \Pi}\max_{c}-H(\pi) + \sum_{s, a}\left(\nu_\mu^\pi(s, a)-\nu_\mu^{\pi_E}(s, a)\right) c(s, a)$$

这等价于如下的优化问题

$$\begin{array}{cl}
\operatorname{maximize} & -H(\pi)\\
\text { s.t. } & \nu_\mu^\pi(s, a)=\nu_\mu^{\pi_E}(s, a),\quad \forall s\in \mathcal{S}, a\in\mathcal{A}
\end{array}$$

该问题的解即为 $\pi=\pi_{E}$，从这里可以看出，如果没有正则项 $\psi$ 的存在，算法将陷入过拟合的困境，因为专家策略总是来自于一个有限的样本，对于没有观测到的状态动作对，$\pi_{E}$ 对应的值是 $0$，因此占用率的完全匹配在这种情况下将会出错。


> **Example 5.** 熵正则化的学徒学习
> $$\underset{\pi}{\operatorname{minimize}}-H(\pi)+\underset{c \in \mathcal{C}}{\max } \mathbb{E}_\pi[c(s, a)]-\mathbb{E}_{\pi_E}[c(s, a)]$$ 是上述框架下的一种形式，其中 $\mathcal{C}$ 限制了奖励函数的形式，例如线性奖励或凸奖励
> $$\begin{aligned}\mathcal{C}_{\text {linear }}&=\left\{\sum_i w_i\phi_i:\|w\|_2 \leq 1\right\} \\
\mathcal{C}_{\text {convex }}&=\left\{\sum_i w_i \phi_i: w_i \geq 0,\sum_i w_i=1 \right\}\end{aligned}$$

我们取正则函数

$$\psi(c) = \begin{cases}0, & \text { if } c\in\mathcal{C} \\ +\infty, & \text { otherwise }\end{cases}$$

那么学徒学习的表达式就可以写成

$$\underset{\pi}{\operatorname{minimize}}-H(\pi)+\underset{c \in \mathbb{R}^{\mathcal{S}\times\mathcal{A}}}{\max } \mathbb{E}_\pi[c(s, a)]-\mathbb{E}_{\pi_E}[c(s, a)] - \psi(c)$$

这正是上述框架的形式，这里也可以看出学徒学习的主要问题，如果专家策略 $\pi_{E}$ 对应的最优奖励函数并不在预设的 $\mathcal{C}$ 中，那么算法永远都找不到它。

---

## *3. Generative Adversarial Imitation Learning*

我们看到常函数的 $\psi$ 能够精确拟合专家数据，但是无法处理大量未观测的环境，而线性函数指示器的 $\psi$ 恰好相反。我们接下来介绍一种结合了两者优点的正则函数。

> **Theorem 6.** 设 $\phi: \mathbb{R} \rightarrow \mathbb{R}$ 是一个严格递减的凸函数且 $-\phi \in T$，取
> $$\begin{aligned}
 g_\phi(x)&= \begin{cases}-x+\phi\left(-\phi^{-1}(-x)\right) & \text { if } x \in T \\
+\infty & \text { otherwise }\end{cases} \\
 \psi_\phi(c)&= \begin{cases}\sum_{s, a} \nu^{\pi_E}_{\mu}(s, a) g_\phi(c(s, a)) & \text { if } c(s, a) \in T \text { for all } s, a \\
+\infty & \text { otherwise }\end{cases}
\end{aligned}$$ 则 $\psi_\phi$ 是一个适当的闭凸函数，且
> $$\psi_\phi^*(\nu_\mu^\pi-\nu_\mu^{\pi_E}) = -R_\phi\left(\nu_\mu^\pi,\nu_\mu^{\pi_E}\right)$$ 其中 $R_{\phi}$ 表示 *minimum expected risk(最小化期望风险)*，即
> $$R_\phi\left(\nu_\mu^\pi,\nu_\mu^{\pi_E}\right) =\sum_{s, a} \min _{\gamma \in \mathbb{R}} \nu_\mu^\pi(s, a) \phi(\gamma)+\nu_\mu^{\pi_E}(s, a) \phi(-\gamma)$$

证明是不难的

$$\begin{aligned}
\psi_\phi^*\left(\nu_\mu^\pi-\nu_\mu^{\pi_E}\right) & =\max _{c \in \mathcal{C}} \sum_{s, a}\left(\nu_\mu^\pi(s, a)-\nu_\mu^{\pi_E}(s, a)\right) c(s, a)-\sum_{s, a} \nu_\mu^{\pi_E}(s, a) g_\phi(c(s, a)) \\
& =\sum_{s, a} \max _{c \in T}\left(\nu_\mu^\pi(s, a)-\nu_\mu^{\pi_E}(s, a)\right) c-\nu_\mu^{\pi_E}(s, a)\left[-c+\phi\left(-\phi^{-1}(-c)\right)\right] \\
& =\sum_{s, a} \max _{c \in T} \nu_\mu^\pi(s, a) c-\nu_\mu^{\pi_E}(s, a) \phi\left(-\phi^{-1}(-c)\right) \\
& =\sum_{s, a} \max _{\gamma \in \mathbb{R}} \nu_\mu^\pi(s, a)(-\phi(\gamma))-\nu_\mu^{\pi_E}(s, a) \phi\left(-\phi^{-1}(\phi(\gamma))\right) \\
& =\sum_{s, a} \max _{\gamma \in \mathbb{R}} \nu_\mu^\pi(s, a)(-\phi(\gamma))-\nu_\mu^{\pi_E}(s, a) \phi(-\gamma) \\
& =-R_\phi\left(\nu_\mu^\pi, \nu_\mu^{\pi_E}\right)
\end{aligned}$$

这里我们做了变量代换 $c \rightarrow-\phi(\gamma)$，这是合理的，因为 $-\phi(\gamma)$ 的值域为 $T$.

这个定理建立了正则函数 $\psi_{\phi}$ 与最小化期望风险 $R_{\phi}$ 之间的关系，而[这篇文章](https://arxiv.org/pdf/math/0510521)证明了最小期望风险 $R_{\phi}$ 与 *f-divergence* 之间的对应关系。因此只要我们选取适当的 $\phi$，就可以构造出优化占用率间的某个 *f-divergence* 的模仿学习算法。


> **Theorem 7.** 取正则函数 $$\begin{aligned}
\psi_{\mathrm{GA}}(c) &=\begin{cases}
\mathbb{E}_{\pi_E}[g(c(s, a))] & \text { if } c<0 \\
+\infty & \text { otherwise }
\end{cases} \\
g(x)&= \begin{cases}-x-\log \left(1-e^x\right) & \text { if } x<0 \\
+\infty & \text { otherwise }\end{cases} \end{aligned}$$ 则其凸共轭满足 
> $$\psi_{\mathrm{GA}}^*\left(\nu_\mu^\pi-\nu_\mu^{\pi_E}\right) = \max _{D \in(0,1)^{\mathcal{S} \times \mathcal{A}}} \mathbb{E}_\pi[\log (D(s, a))]+\mathbb{E}_{\pi_E}[\log (1-D(s, a))]$$ 

证明很简单，只需要在 *Theorem 6* 中取

$$\phi(x)=\log \left(1+e^{-x}\right),\quad \phi^{-1}(x)=-\log{(e^{x}-1)}$$

对应的 $T=(-\infty,0)$，当 $x<0$ 时有

$$\begin{aligned}g_\phi(x) 
&= -x + \phi\left(\log(e^{-x}-1)\right) = -x + \log\left(1 + \frac{1}{e^{-x}-1}\right)\\
&= -x + \log\left(\frac{e^{-x}}{e^{-x}-1}\right)= -x + \log\left(\frac{1}{1-e^{x}}\right)\\
&= -x - \log\left({1-e^{x}}\right)\\
\end{aligned}$$

这就是本定理中设定的 $g(x)$，因此

$$\begin{aligned}
\psi_{\mathrm{GA}}^*\left(\nu_\mu^\pi-\nu_\mu^{\pi_E}\right) & =-R_\phi\left(\nu_\mu^\pi, \nu_\mu^{\pi_E}\right) \\
& =\sum_{s, a} \max _{\gamma \in \mathbb{R}} \nu_\mu^\pi(s, a) \log \left(\frac{1}{1+e^{-\gamma}}\right)+\nu_\mu^{\pi_E}(s, a) \log \left(\frac{1}{1+e^\gamma}\right) \\
& =\sum_{s, a} \max _{\gamma \in \mathbb{R}} \nu_\mu^\pi(s, a) \log \left(\frac{1}{1+e^{-\gamma}}\right)+\nu_\mu^{\pi_E}(s, a) \log \left(1-\frac{1}{1+e^{-\gamma}}\right) \\
& =\sum_{s, a} \max _{\gamma \in \mathbb{R}} \nu_\mu^\pi(s, a) \log (\sigma(\gamma))+\nu_\mu^{\pi_E}(s, a) \log (1-\sigma(\gamma)),
\end{aligned}$$

其中 $\sigma(x) = \frac{1}{1+e^{-x}}$ 是 *sigmoid function*，值域为 $(0,1)$，因此

$$\begin{aligned}
LHS & =\sum_{s, a} \max _{d \in(0,1)} \nu_\mu^\pi(s, a) \log d+\nu_\mu^{\pi_E}(s, a) \log (1-d) \\
& =\max _{D \in(0,1)^{\mathcal{S} \times \mathcal{A}}} \sum_{s, a} \nu_\mu^\pi(s, a) \log (D(s, a))+\nu_\mu^{\pi_E}(s, a) \log (1-D(s, a))
\end{aligned}$$

证明完毕，可以看到 $\psi_{\mathrm{GA}}^{*}$ 的形式和 *GAN* 一模一样，其目标是寻找一个分类器 $D: \mathcal{S} \times \mathcal{A} \rightarrow(0,1)$ 能够区分状态动作对 $(s,a)$ 是否来自专家轨迹。算法的本质是最小化当前策略 $\pi$ 与专家策略 $\pi_{E}$ 对应的占用率之间的 *JS* 散度。

根据 *Theorem 7*，我们最终要求解的问题是

$$\arg\min_{\pi}\max _{D \in(0,1)^{s \times \mathcal{A}}} \mathbb{E}_\pi[\log (D(s, a))]+\mathbb{E}_{\pi_E}[\log (1-D(s, a))] - H(\pi)$$

记参数化的判别器和策略网络分别为 $D_{w},\pi_{\theta}$，判别器直接用下面的 *loss* 训练即可

$$J(w) = \mathbb{E}_\pi[\log (D_{w}(s, a))]+\mathbb{E}_{\pi_E}[\log (1-D_{w}(s, a))]$$

策略网络 $\pi_{\theta}$ 的 *loss* 则是

$$J(\theta) =  \mathbb{E}_{\pi_{\theta}}[\log (D(s, a))] -H(\pi_{\theta}) $$

这等价于在 $c(s,a)=\log D(s,a)$ 的设定下做强化学习，使用 *TRPO* 来做即可。

> **Method 8. GAIL.** 对于给定的专家轨迹数据集 $\tau_{E}\sim\pi_{E}$，算法流程如下：
>
> 1. 初始化参数 $w,\theta$
> 2. 枚举迭代次数 $i=0,1,2,\cdots$
>   - 采样轨迹 $\tau_{i}\sim\pi_{\theta}$
>   - 更新判别器参数 $$\nabla J(w)=\mathbb{E}_{\tau_i}\left[\nabla_w \log \left(D_w(s, a)\right)\right]+{\mathbb{E}}_{\tau_E}\left[\nabla_w \log \left(1-D_w(s, a)\right)\right]$$
>   - 更新策略网络参数 $$\nabla J(\theta) = \mathbb{E}_{\tau_i}\left[\nabla_\theta \log \pi_\theta(a | s) Q(s, a)\right]-\lambda \nabla_\theta H\left(\pi_\theta\right)$$ 其中 $Q(s,a)$ 表示奖励函数 $c(s,a)=\log D(s,a)$ 下的期望折扣回报。




---

## *Appendix A: Convex Conjugate*

故事从 *Legendre transform(勒让德变换)* 说起，假设我们想要做如下的变量代换

$$F(x,y)\rightarrow G(u,y)$$

其中 $x,y,u\in\mathbb{R}^{n}$，这种代换在物理学中常常见到，那么如何实现它呢？

我们考虑全微分 $$dF = \left(\frac{\partial{F}}{\partial{x}}\right)^{T}dx + \left(\frac{\partial{F}}{\partial{y}}\right)^{T}dy$$

设 $u=\frac{\partial{F}}{\partial{x}}$，则

$$dF = u^{T}dx + \left(\frac{\partial{F}}{\partial{y}}\right)^{T}dy = u^{T}x - x^{T}du + \left(\frac{\partial{F}}{\partial{y}}\right)^{T}dy$$
 

整理一下得到

$$x^{T}du - \left(\frac{\partial{F}}{\partial{y}}\right)^{T}dy = u^{T}x - dF = d(u^{T}x - F)$$
 
不妨设 $$G(u,y) = u^{T}x - F(x,y)$$

我们就完成了勒让德变换，现在看一下各变量间的关系

$$\left\{\begin{array}{l}
dG = x^T d u-\left(\frac{\partial F}{\partial y}\right)^T d y \\
dG = \left(\frac{\partial G}{\partial u}\right)^T d u + \left(\frac{\partial G}{\partial y}\right)^T d y
\end{array}\right. \Rightarrow
\left\{\begin{array}{l}
\frac{\partial G}{\partial u} = x\\
\frac{\partial G}{\partial y} = -\frac{\partial F}{\partial y} \\
\frac{\partial F}{\partial x} = u
\end{array}\right.$$

注意到 $y$ 在变换前后并无变化，因此我们可以省去 $y$ 写成单变量变换的形式

$$G(u) = u^{T}x - F(x)$$

我们解释一下勒让德变换的几何意义，如下图所示

<center><img src="https://leanote.com/api/file/getImage?fileId=68428ee0ab644172fc3f9872" width=250px></center>

蓝色的曲线是 $F(x)$，我们在点 $x$ 处做一条切线，设切线斜率为 $s$，那么

$$G(s) = sx - F(x)$$

就表示图中绿色线段所示的部分，也就是这条切线的负截距。因此勒让德变换本质上是把函数 $F$ 变换成了斜率和负截距的映射关系 $G$.

可如果函数 $F$ 非凸或者不可微，那么勒让德变换将会不可解，如下图所示

<center><img src="https://leanote.com/api/file/getImage?fileId=684292feab644172fc3f987a" width=300px></center>

对于斜率 $s$，函数 $F(x)$ 上存在两条切线与之对应，那么 $G(s)$ 的值是取 $-b_{0}$ 还是 $-b_{1}$ 呢？

> **Definition 9. Convex Conjugate(凸共轭).** 设函数 $f:\mathbb{R}^{n}\rightarrow \mathbb{R}$，定义其共轭函数
> $$f^*(y)=\sup _{x \in \operatorname{dom} f}\left(y^T x-f(x)\right)$$ 由于仿射函数逐点取上确界是保凸运算，因此 $f^{*}$ 一定是凸函数。

共轭函数拓展了勒让德变换，在多条切线中取了截距最小的那条，保证了映射关系 $G$ 的唯一性，这样我们解决了 $F(x)$ 非凸或不可微的问题。


---

## *Appendix B: Convexity of $H(\pi)$*

> **Theorem 10.** 策略函数 $\pi$ 的因果熵 $$H(\pi) = -\sum_{s,a} \nu^{\pi}_{\mu}(s,a)\log \pi(a|s)$$ 是严格凸函数。

根据 *Theorem 2*，我们知道 $\pi$ 与 $\nu^{\pi}_{\mu}$ 是一一对应的线性关系，因此只需要证明

$$H(\nu^{\pi}_{\mu}) = -\sum_{s,a} \nu^{\pi}_{\mu}(s,a)\log \frac{\nu_\mu^\pi(s, a)}{\sum_{a^{\prime}} \nu_\mu^\pi(s, a^{\prime})}$$

是严格凸函数即可。为了书写方便，我们接下来将省略 $\nu^{\pi}_{\mu}$ 的角标简写为 $\nu$，对于 $\lambda\in [0,1]$，有

$$\begin{aligned}H(\lambda\nu + (1-\lambda)\nu^{\prime}) 
&= -\sum_{s,a}\left[\lambda \nu(s, a)+(1-\lambda) \nu^{\prime}(s, a)\right] \log \frac{\lambda \nu(s, a)+(1-\lambda) \nu^{\prime}(s, a)}{\lambda\sum_{a^{\prime}} \nu\left(s, a^{\prime}\right)+(1-\lambda)\sum_{a^{\prime}} \nu^{\prime}\left(s, a^{\prime}\right)} \\
&\geq -\sum_{s,a} \left\{\lambda \nu(s, a) \log \frac{ \nu(s, a)}{ \sum_{a^{\prime}} \nu\left(s, a^{\prime}\right)}+(1-\lambda) \nu^{\prime}(s, a) \log \frac{ \nu^{\prime}(s, a)}{ \sum_{a^{\prime}} \nu^{\prime}\left(s, a^{\prime}\right)}\right\}\\
&= \lambda H(\nu) + (1-\lambda)H(\nu^{\prime})
\end{aligned}$$

我们解释一下不等号成立的原因，记 

$$a_{1} = \lambda \nu(s, a),\quad a_{2}=(1-\lambda) \nu^{\prime}(s, a),\quad b_{1}=\lambda \sum_{a^{\prime}} \nu\left(s, a^{\prime}\right),\quad b_{2}=(1-\lambda) \sum_{a^{\prime}} \nu^{\prime}\left(s, a^{\prime}\right)$$

那么根据 *log-sum inequality(对数求和不等式)* 有

$$(a_{1}+a_{2})\log{\frac{a_{1}+a_{2}}{b_{1}+b_{2}}}\leq a_{1}\log\frac{a_{1}}{b_{1}} + a_{2}\log\frac{a_{2}}{b_{2}}$$

代入进去就是上面的式子了，取等条件为 $\frac{a_{1}}{b_{1}}=\frac{a_{2}}{b_{2}}$，即

$$\pi(a|s) = \frac{\nu(s, a)}{\sum_{a^{\prime}} \nu\left(s, a^{\prime}\right)}  = \frac{\nu^{\prime}(s, a)}{\sum_{a^{\prime}} \nu^{\prime}\left(s, a^{\prime}\right)} = \pi^{\prime}(a|s)$$

因此 $H(\pi)$ 为严格凸函数。

---

## *Reference*

- https://arxiv.org/pdf/1606.03476
- https://www.bilibili.com/video/BV19t4y127ai/?spm_id_from=333.1387.upload.video_card.click&vd_source=39b3c15ee891e90bdcf017022f28f8c9
- https://www.schapire.net/papers/SyedBowlingSchapireICML2008.pdf
- https://en.wikipedia.org/wiki/Log_sum_inequality
- https://zhuanlan.zhihu.com/p/60327435
- https://www.ericli.vip/2024/10/09/IRL/Article%20Reading/GAIL/
