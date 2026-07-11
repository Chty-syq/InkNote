---
type: markdown
title: 强化学习重学系列(12) Trust Region Policy Optimization
slug: "4575204"
order: 7
date: 2025-04-01
updatedAt: 2026-07-01 01:26:43
tags:
  - 强化学习
published: true
category: machine-learning
---

## *1. Trust-Region Formulation(置信域表达式)*

在上一节中，我们通过近似状态分布的方法，将问题近似为求解

$$\pi^{\prime}=\arg \max _{\pi^{\prime}} \mathbb{E}_{s \sim d_\mu^\pi}\left[A^\pi\left(s, \pi^{\prime}(s)\right)\right]$$

只要保证新旧策略相近，就能保证新策略的一致提升。进一步的，我们可以不局限于

$$\pi_{\text {new }}=\alpha \pi^{\prime}+(1-\alpha) \pi$$

这样固定的形式，而是直接考虑度量两个策略分布的距离。

> **Definition 1. Total Variation Distance(全变分距离).** 对于 $\mathcal{X}$ 上的两个概率分布 $p(x),q(x)$，定义它们的全变分距离
> $$D_{\text{TV}}(p\mid\mid q) = \frac{1}{2} \sum_{x \in \mathcal{X}}|p(x)-q(x)|=\frac{1}{2}\left\|p-q\right\|_{1}$$

<div></div>

> **Theorem 2. Pinsker's inequality.** 对于概率分布 $p(x),q(x)$，有
> $$2D^{2}_{\text{TV}}(p\mid\mid q) \leq D_{\text{KL}}(p\mid\mid q)$$ 其中 $D_{\text{KL}}$ 表示 [*KL-divergence*](http://blog.leanote.com/post/chty_syq/KL-D).

在之前的设定下，新旧策略分布满足

$$\left\|\pi_{\text {new }}(s)-\pi(s)\right\|_1 \leq 2 \alpha$$

显然它是 $D_{\text{TV}}$ 的形式，现在我们可以抛却新旧策略线性加权的形式，而是令新策略 $\tilde{\pi}$ 满足

$$D_{\mathrm{TV}}(\pi(s) \mid\mid \tilde{\pi}(s)) \leq \alpha,\quad \text{for all } s\in \mathcal{S}$$

> **Theorem 3.** 设 $\alpha = \max_{s}D_{\mathrm{TV}}(\pi(s) \mid\mid \tilde{\pi}(s)) $，则有
> $$\mathbb{E}_{s \sim d_\mu^\pi}\left[A^\pi\left(s, \tilde{\pi}(s)\right)\right] \leq \mathbb{E}_{s \sim d_\mu^{\tilde{\pi}}}\left[A^\pi\left(s, \tilde{\pi}(s)\right)\right] + \frac{4\epsilon \gamma}{(1-\gamma)^{2}}\alpha^{2}$$

这个式子告诉我们在 $\alpha$ 足够小的情况下，优化左边的近似式等价于优化右边的真值，根据 *Theorem 2* 可以写成

$$\mathbb{E}_{s \sim d_\mu^\pi}\left[A^\pi\left(s, \tilde{\pi}(s)\right)\right] \leq \mathbb{E}_{s \sim d_\mu^{\tilde{\pi}}}\left[A^\pi\left(s, \tilde{\pi}(s)\right)\right] + C\cdot D_{\text{KL}}^{\max}(\pi(s)\mid\mid\tilde{\pi}(s))$$

其中 $C = \frac{4\gamma}{(1-\gamma)^{2}}$，而

$$D_{\text{KL}}^{\max}(\pi(s)\mid\mid\tilde{\pi}(s)) = \max_{s}D_{\mathrm{KL}}(\pi(s) \mid\mid \tilde{\pi}(s))$$

因此我们要做的就是解如下的优化问题

> $$\begin{array}{ll}
\max_{\tilde{\pi}}  & \mathbb{E}_{s \sim d_\mu^\pi}\left[A^\pi(s, \tilde{\pi}(s))\right] \\
\text { s.t. } & D_{\text{KL}}^{\max}(\pi(s)\mid\mid\tilde{\pi}(s)) \leq \delta
\end{array}$$

---

## *2. Simplify Problem(简化问题)*

我们观察这个优化问题，它的目标函数和限制条件都很复杂，尤其是限制条件，它要求对于所有的状态 $s$ 都成立，我们不妨把它简化为对期望的限制

$$\mathbb{E}_{s\sim d^{\pi}_{\mu}} \left[D_{\text{KL}}(\pi(s)\mid\mid\tilde{\pi}(s))\right] \leq \delta$$

另外不要忘记新旧策略函数都是用参数 $\theta$ 代表的神经网络建模的，记新旧策略 $\pi,\tilde{\pi}$ 对应的参数分别为 $\theta_{\text{old}},\theta$，为了书写方便，记 

$$D_{\mathrm{KL}}(\theta_{\text{old}} \mid\mid \theta) = D_{\mathrm{KL}}(\pi(s) \mid\mid \tilde{\pi}(s))$$

那么现在的优化问题就变成了

> $$\begin{array}{ll}
\max_{\theta}  & \mathbb{E}_{s \sim d_\mu^{\pi_{\theta_{\text{old}}}},a\sim \pi_{\theta}}\left[A^{\pi_{\theta_{\text{old}}}}(s, a)\right] \\
\text { s.t. } & \mathbb{E}_{s \sim d_\mu^{\pi_{\theta_{\text{old}}}}} \left[D_{\text{KL}}(\theta_{\text{old}}\mid\mid\theta)\right] \leq \delta
\end{array}$$

### *Simplify Objective Function*

记目标函数

$$J(\theta) = \mathbb{E}_{s \sim d_\mu^{\pi_{\theta_{\text{old}}}},a\sim \pi_{\theta}}\left[A^{\pi_{\theta_{\text{old}}}}(s, a)\right]$$

由于 $\theta,\theta_{\text{old}}$ 的距离相差不大，我们可以考虑在 $\theta_{\text{old}}$ 处一阶泰勒展开得到

$$J(\theta) \approx J(\theta_{\text{old}}) + \nabla_{\theta} J(\theta_{\text{old}})^{T} (\theta - \theta_{\text{old}})$$

显然 $J(\theta_{\text{old}}) = 0$，因为策略函数对自身的优势肯定是 $0$，而 $\nabla_{\theta} J(\theta_{\text{old}})$ 实际上就是我们之前讲到的 *baseline* 方法中的目标函数

$$\nabla_{\theta} J(\theta_{\text{old}}) = \mathbb{E}_{(s,a) \sim d_\mu^{\pi_{\theta_{\text{old}}}}}\left[\nabla_{\theta}\log\pi_{\theta_{\text{old}}}(a|s) A^{\pi_{\theta_{\text{old}}}}(s, a)\right]$$

### *Simplify Constraint*

约束条件的简化较为复杂，不妨先分析一下左边的式子，记

$$\begin{aligned}\ell(\theta) 
&= \mathbb{E}_{s \sim d_\mu^{\pi_{\theta_{\text{old}}}}} \left[D_{\text{KL}}(\theta_{\text{old}}\mid\mid\theta)\right] \\
&= \mathbb{E}_{s \sim d_\mu^{\pi_{\theta_{\text{old}}}}} \left[\sum_{a}\pi_{\theta_{\text{old}}}(a|s)\log\frac{\pi_{\theta_{\text{old}}}(a|s)}{\pi_{\theta}(a|s)}\right] \\
&= \mathbb{E}_{(s,a) \sim d_\mu^{\pi_{\theta_{\text{old}}}}} \left[\log\frac{\pi_{\theta_{\text{old}}}(a|s)}{\pi_{\theta}(a|s)}\right] \\
\end{aligned}$$

同样的我们在 $\theta_{\text{old}}$ 处二阶泰勒展开得到

$$\ell(\theta) \approx \ell(\theta_{\text{old}}) + \nabla_{\theta}\ell(\theta_{\text{old}})(\theta - \theta_{\text{old}}) +(\theta-\theta_{\text{old}})^{T} \nabla^2_{\theta}\ell(\theta_{\text{old}})(\theta-\theta_{\text{old}})$$

显然 $\ell(\theta_{\text{old}})=0$，我们计算一阶导

$$\begin{aligned}\nabla_{\theta}\ell(\theta_{\text{old}}) 
&= \mathbb{E}_{(s,a) \sim d_\mu^{\pi_{\theta_{\text{old}}}}} \left[\nabla_{\theta}\log\frac{\pi_{\theta_{\text{old}}}(a|s)}{\pi_{\theta}(a|s)}\right]_{\theta=\theta_{\text{old}}}\\
&= -\mathbb{E}_{(s,a) \sim d_\mu^{\pi_{\theta_{\text{old}}}}} \left[\nabla_{\theta}\log\pi_{\theta}(a|s)\right]_{\theta=\theta_{\text{old}}}\\
\end{aligned}$$

注意到期望里面的东西其实就是 *score function* (见附录)

$$S(\theta;s,a)=\nabla_\theta \log \pi_\theta(a | s)$$

因此根据 *Theorem 5*，这个东西关于 $(s,a) \sim d_\mu^{\pi_{\theta_{\text{old}}}}$ 的期望在 $\theta = \theta_{\text{old}}$ 处的值为 $0$，而二阶导

$$\nabla^2_{\theta}\ell(\theta_{\text{old}}) = -\mathbb{E}_{(s,a) \sim d_\mu^{\pi_{\theta_{\text{old}}}}} \left[\nabla^2_{\theta}\log\pi_{\theta}(a|s)\right]_{\theta=\theta_{\text{old}}}$$

注意到期望里面的东西其实就是

$$\mathrm{H}_{\log\pi_{\theta}(a|s)} = \nabla^2_{\theta}\log\pi_{\theta}(a|s)$$

因此根据 *Theorem 9*，这个东西关于 $(s,a) \sim d_\mu^{\pi_{\theta_{\text{old}}}}$ 的期望在 $\theta = \theta_{\text{old}}$ 处的值是一个 *Fisher* 矩阵

$$\nabla^2_{\theta}\ell(\theta_{\text{old}}) = \mathrm{F}_{\theta_{\text{old}}}$$

因此约束条件就是

$$(\theta-\theta_{\text{old}})^{T} \mathrm{F}_{
\theta_{\text{old}}}(\theta-\theta_{\text{old}}) \leq \delta$$

我们最终得到了一个凸优化问题

> $$\begin{array}{ll}
\max_{\theta}  & \nabla_\theta J\left(\theta_{\text {old }}\right)^{T}(\theta-\theta_{\text{old}}) \\
\text { s.t. } & (\theta-\theta_{\text{old}})^{T} \mathrm{F}_{
\theta_{\text{old}}}(\theta-\theta_{\text{old}}) \leq \delta
\end{array}$$

---

## *3. Natural Policy Gradient(自然策略梯度)*

为了书写方便，记 $d=\theta-\theta_{\text{old}}$，按照解凸优化的套路，我们使用拉格朗日乘数法得到

$$f(\theta,\lambda) = \nabla_\theta J\left(\theta_{\text {old }}\right)^{T} d + \lambda(d^{T} \mathrm{F}_{\theta_{\text{old}}}d - \delta)$$

最优值 $d^*$ 满足如下的 *KKT* 条件

$$\left\{\begin{array}{c}
\frac{\partial}{\partial \theta} f(\theta,\lambda) = 0\\
\lambda \geq 0 \\
\lambda(d^{T} \mathrm{F}_{\theta_{\text{old}}}d - \delta) = 0
\end{array}\right. 
\Rightarrow d^{*} = -\frac{1}{\lambda} \mathrm{F}_{\theta_{\text{old}}}^{-1} \nabla_\theta J\left(\theta_{\text {old }}\right)$$

现在我们获得了梯度下降的迭代式

$$\theta \leftarrow \theta_{\text{old}} - \alpha \mathrm{F}^{-1}_{\theta_{\text{old}}}\nabla_\theta J\left(\theta_{\text {old }}\right)$$

然而我们忽略了 *KKT* 条件中还有一条约束

$$\lambda(d^{T} \mathrm{F}_{\theta_{\text{old}}}d - \delta) = 0$$

理论上最好的优化区域并不是在置信域内，而是在置信边界上，因此令

$$d^{T} \mathrm{F}_{\theta_{\text{old}}} d-\delta = 0$$

利用这个条件来修正我们的学习率 $\alpha$，即

$$(-\alpha d^{*})^{T} \mathrm{F}_{\theta_{\text{old}}} (-\alpha d^{*}) = \delta $$

得到

$$\alpha = \sqrt{\frac{\delta}{(d^{*})^{T}\mathrm{F}_{\theta_{\text{old}}}d^{*}}} = \sqrt{\frac{\delta}{\nabla_\theta J\left(\theta_{\text {old }}\right)^{T}\mathrm{F}_{\theta_{\text{old}}}^{-1}\nabla_\theta J\left(\theta_{\text {old }}\right)}}$$

> **Method 10.** *NPG* 算法每次迭代的流程如下
> 
>   1.  使用 *PG* 方法计算策略梯度 $$g = \nabla_\theta J\left(\theta_{\text {old }}\right)$$
>   2. 计算 *Fisher information matrix* $$\mathrm{F}_{\theta_{\text{old}}} = \mathbb{E}_{(s,a) \sim d_\mu^{\pi_{\theta_{\text{old}}}}} \left[\nabla_\theta \log \pi_{\theta_{\text{old}}}(a | s)\nabla_\theta \log \pi_{\theta_{\text{old}}}(a | s)^{T}\right]$$
>   3. 计算迭代步长 $$\alpha = \sqrt{\frac{\delta}{g^{T}\mathrm{F}_{\theta_{\text{old}}}^{-1}g}}$$
>   4. 更新参数 $$\theta \leftarrow \theta_{\text {old }}-\alpha \mathrm{F}_{\theta_{\text {old }}}^{-1} g$$

在每次迭代中，我们都需要求 $\mathrm{F}_{\theta_{\text {old }}}^{-1}$，而矩阵求逆的开销是很大的，不妨将 $\mathrm{F}_{\theta_{\text {old }}}g$ 看做一个整体

$$x = \mathrm{F}_{\theta_{\text {old }}}^{-1}g$$

显然 $x$ 是线性方程组 $\mathrm{F}_{\theta_{\text {old }}}x = g$ 的解，而费雪矩阵是一个正定阵，可以愉快的使用[共轭梯度法](http://blog.leanote.com/post/chty_syq/b55f62118b31)解决。

---

## *Appendix A: Fisher's Score and Information*

> **Definition 4. Score.** 对于参数 $\theta$ 建模的概率分布 $p_{\theta}(x)$，定义 *score* 函数 $s:\mathbb{R^{d}} \rightarrow \mathbb{R^{d}}$
> $$s(\theta;x)=\nabla_{\theta} \log p_{\theta}(x)$$

我们说明一下 *score function* 的来历，在进行极大似然估计时，我们通常在样本集 $\{x^{(i)}\}$ 上求解

$$\theta^{*} = \max _\theta \sum_{i}\log p_{\theta}(x^{(i)})$$

求解方法就是对右边求导，得到方程

$$\sum_{i}\nabla_{\theta}\log p_{\theta}(x^{(i)}) = \sum_{i}s(\theta;x^{(i)}) = 0$$

由此可见，*score function* 描述了参数 $\theta$ 的变化对于对数似然的影响程度。

> **Theorem 5.** 对于参数 $\theta$ 建模的概率分布 $p_{\theta}(x)$，其 *score function* 满足 
> $$\mathbb{E}_{x\sim p_{\theta}}[s(\theta;x)] = 0$$

证明是比较显然的

$$\begin{aligned} \mathbb{E}_{x\sim p_{\theta}}[s(\theta;x)]
&=\int p_{\theta}(x)\nabla_{\theta} \log p_{\theta}(x) \mathrm{d} x \\
&=\int \nabla_{\theta} p_{\theta}(x) \mathrm{d} x =\nabla_{\theta} \int p_{\theta}(x ) \mathrm{d} x =0
\end{aligned}$$

> **Definition 6. Fisher Information.** 对于参数 $\theta$ 建模的概率分布 $p_{\theta}(x)$，定义 *Fisher information matrix* 为
> $$\begin{aligned}\mathrm{F}_{\theta} &= \text{Var}(s(\theta;x)) \\
&= \mathbb{E}_{x\sim p_{\theta}(x)}\left[s(\theta;x)s^{T}(\theta;x)\right]-\mathbb{E}^{2}_{x\sim p_{\theta}(x)}\left[s(\theta;x)\right] \\
&= \mathbb{E}_{x\sim p_{\theta}(x)}\left[  s(\theta;x) s(\theta;x)^{T}  \right]
\end{aligned}$$ 这个矩阵说明了极大似然估计的置信程度。

<div></div>

> **Definition 7. Jacabian Matrix** 对于函数 $f:\mathbb{R^{n}} \rightarrow \mathbb{R}^{m}$，定义 *Jacobian matrix* 为一阶导矩阵
> $$\mathbf{J}=\left[\begin{array}{cc}
\nabla f_{1}  &
\cdots & \nabla f_{m}
\end{array}\right]=\left[\begin{array}{ccc}
\frac{\partial f_{1}}{\partial x_{1}} & \cdots & \frac{\partial f_{1}}{\partial x_{n}} \\
\vdots & \ddots & \vdots \\
\frac{\partial f_{m}}{\partial x_{1}} & \cdots & \frac{\partial f_{m}}{\partial x_{n}}
\end{array}\right]$$ 

<div></div>

> **Definition 8. Hessian Matrix** 对于函数 $f:\mathbb{R^{d}} \rightarrow \mathbb{R}$，定义其 *Hessian matrix* 为二阶混合导矩阵
> $$\mathbf{H}_{f}=\left[\begin{array}{cccc}
\frac{\partial^{2} f}{\partial x_{1}^{2}} & \frac{\partial^{2} f}{\partial x_{1} \partial x_{2}} & \cdots & \frac{\partial^{2} f}{\partial x_{1} \partial x_{n}} \\
\frac{\partial^{2} f}{\partial x_{2} \partial x_{1}} & \frac{\partial^{2} f}{\partial x_{2}^{2}} & \cdots & \frac{\partial^{2} f}{\partial x_{2} \partial x_{n}} \\
\vdots & \vdots & \ddots & \vdots \\
\frac{\partial^{2} f}{\partial x_{n} \partial x_{1}} & \frac{\partial^{2} f}{\partial x_{n} \partial x_{2}} & \cdots & \frac{\partial^{2} f}{\partial x_{n}^{2}}
\end{array}\right]$$ 从定义中我们可以得到一个显然的推论
> $$\mathbf{H}_{f}=\mathbf{J}(\nabla f)$$

<div></div>

> **Theorem 9.** 对于参数 $\theta$ 建模的概率分布 $p_{\theta}(x)$，有
> $$\mathbb{E}_{x\sim p_{\theta}}[\mathrm{H}_{\log p_{\theta}(x)}] = -\mathrm{F}_{\theta}$$

证明：我们使用 *Jacobian* 矩阵作为桥梁计算

$$\begin{aligned}
\mathrm{H}_{\log p_{\theta}(x)} &=\mathrm{J}\left(\frac{\nabla_{\theta} p_{\theta}(x)}{p_{\theta}(x)}\right) \\
&=\frac{\mathrm{H}_{p_{\theta}(x)} p_{\theta}(x)-\nabla_{\theta} p_{\theta}(x) \nabla_{\theta} p_{\theta}(x)^{\mathrm{T}}}{p^{2}_{\theta}(x)} \\
&=\frac{\mathrm{H}_{p_{\theta}(x)}}{p_{\theta}(x)}-\left(\frac{\nabla_{\theta} p_{\theta}(x)}{p_{\theta}(x)}\right)\left(\frac{\nabla_{\theta} p_{\theta}(x)}{p_{\theta}(x)}\right)^{\mathrm{T}}
\end{aligned}$$

取期望得到

$$\begin{aligned}\mathbb{E}_{x\sim p_{\theta}}\left[\mathrm{H}_{\log p_{\theta}(x)}\right] 
&=\mathbb{E}_{x\sim p_{\theta}}\left[\frac{\mathrm{H}_{p_{\theta}(x)}}{p_{\theta}(x)}\right]-\mathbb{E}_{x\sim p_{\theta}}\left[\left(\frac{\nabla p_{\theta}(x)}{p_{\theta}(x)}\right)\left(\frac{\nabla p_{\theta}(x)}{p_{\theta}(x)}\right)^{\mathrm{T}}\right]\\
&=\int \frac{\mathrm{H}_{p_{\theta}(x)}}{p_{\theta}(x)} p_{\theta}(x) \mathrm{d} x-\mathbb{E}_{x\sim p_{\theta}}\left[\nabla \log p_{\theta}(x) \nabla \log p_{\theta}(x)^{\mathrm{T}}\right]\\
&=\mathrm{H}_{\int p_{\theta}(x) \mathrm{d} x}-\mathrm{F}_{\theta}=-\mathrm{F}_{\theta}
\end{aligned}$$

---

## *Reference*

- https://wensun.github.io/CS4789_data/TRPO_April_1_annotated.pdf
- https://pages.uoregon.edu/dlevin/MARKOV/markovmixing.pdf
- https://arxiv.org/pdf/2202.07198
- https://bobondemon.github.io/2022/01/07/Score-Function-and-Fisher-Information-Matrix/
