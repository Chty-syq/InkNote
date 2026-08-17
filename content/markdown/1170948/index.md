---
type: markdown
title: 强化学习重学系列(8) Bellman Operator
slug: "1170948"
order: 12
date: 2025-02-08
updatedAt: 2026-07-01 01:26:36
tags:
  - 强化学习
published: true
category: machine-learning
---

## *1. Bellman Operator(贝尔曼算子)*

回顾一下我们在[强化学习重学系列(3) Dynamic Programming](http://blog.leanote.com/post/chty_syq/3b0df0c7e27c)中的迭代方法，*PI* 方法利用 *Bellman equation(贝尔曼方程)* 进行价值函数的更新

$$v_\pi(s)=\sum_a \pi(a | s) \sum_{s^{\prime}, r} p\left(s^{\prime}, r | s, a\right)\left[r+\gamma v_\pi\left(s^{\prime}\right)\right]$$

而 *VI* 方法则是利用 *Bellman optimality equation(贝尔曼最优化方程)* 

$$v_*(s)=\max _a \sum_{s^{\prime}, r} p\left(s^{\prime}, r | s, a\right)\left[r+\gamma v_*\left(s^{\prime}\right)\right]$$

然而目前为止的知识并不能保证迭代最终收敛，本章我们将从算子的角度重新审视 *PI* 和 *VI* 的迭代过程，并证明其收敛性

为了书写方便，首先我们对贝尔曼方程做一些变形

$$\begin{aligned}v_\pi(s)
& =\sum_{a} \pi(a | s)\left[\sum_{r} p(r | s, a) r+\gamma \sum_{s^{\prime}} p\left(s^{\prime} | s, a\right) v_\pi\left(s^{\prime}\right)\right] \\
& =\sum_{a} \pi(a | s)\sum_{r} p(r | s, a) r +\gamma \sum_{a} \pi(a | s)\sum_{s^{\prime}} p\left(s^{\prime} | s, a\right) v_\pi\left(s^{\prime}\right) \\
& =r_\pi(s)+\gamma \sum_{s^{\prime}} p_\pi\left(s^{\prime} | s\right) v_\pi\left(s^{\prime}\right)
\end{aligned}$$

其中 $r_{\pi}(s)$ 表示策略 $\pi$ 下即时奖励的期望值，$p_{\pi}(s^{\prime}|s)$ 表示策略 $\pi$ 下从状态 $s$ 转移到 $s^{\prime}$ 的概率，设状态集的大小为 $n = |\mathcal{S}|$，那么我们可以把上式写成矩阵形式

$$\left[\begin{array}{c}
v_\pi(1) \\
\vdots \\
v_\pi(n)
\end{array}\right]=\left[\begin{array}{c}
r_\pi(1) \\
\vdots \\
r_\pi(n)
\end{array}\right]+\gamma\left[\begin{array}{ccc}
p_\pi(1 | 1) & \ldots & p_\pi(n | 1) \\
\vdots & \ddots & \vdots \\
p_\pi(1 | n) & \ldots & p_\pi(n | n)
\end{array}\right]\left[\begin{array}{c}
v_\pi(1) \\
\vdots \\
v_\pi(n)
\end{array}\right]$$

因此，我们把 $v_{\pi},r_{\pi}$ 看成 $\mathbb{R}^{n}$ 的向量，把 $p_{\pi}$ 看成 $\mathbb{R}^{n\times n}$ 的矩阵，那么迭代的过程其实就是矩阵乘法

$$v_\pi \leftarrow r_\pi+\gamma P_\pi v_\pi$$

我们定义贝尔曼算子 $\mathcal{T}^\pi: \mathbb{R}^n \rightarrow \mathbb{R}^n$

$$\mathcal{T}^\pi(v)=r_\pi+\gamma P_\pi v$$

贝尔曼算子表示了一种向量的迭代操作，而我们要证明的是对于任意的 $v\in \mathbb{R}^{n}$，不断执行该算子，最终会收敛到某个确定的 $v^{*}\in \mathbb{R}^{n}$.

如何证明呢？用数学的语言来讲，如果 $\mathcal{T}^{\pi}$ 是某个**完备度量空间**上的一个**压缩映射**，那么根据**巴拿赫不动点定理**，就能证明上述的收敛性质。

在此之前我们得先了解一下相关的数学知识。

---

## *2. Some Mathmatics(一些数学)*

> **Definition 1. Fixed Point(不动点).** 对于函数 $f(x)$，选取任意的 $x_{0}$，若 $$x_*=\lim _{n \rightarrow \infty} f^n\left(x_0\right)$$ 存在，则 $x_{*}$ 为函数 $f$ 的一个不动点，其中 $f^{n}$ 表示连续执行 $n$ 次函数 $f$，不动点 $x_{*}$ 满足 $$f(x_{*}) = x_{*}$$

<div></div>

> **Definition 2. Metric Space(度量空间).** 若集合 $M$ 上有 *metric function(测度函数)* $d$，即对于任意的 $x,y,z\in M$，函数 $d$ 满足
>
> - $ d(x, y)=0 \Leftrightarrow x=y$
> - $ d(x, y)=d(y, x)$
> - $ d(x, z) \leq d(x, y)+d(y, z)$
>
> 则称 $(M,d)$ 为度量空间，且由上述性质可推导出 $d(x,y)\geq 0$.

<div></div>

> **Definition 3. Cauchy Sequence(柯西序列).** 设 $\{x_{n}\}$ 为度量空间 $(M,d)$ 中的序列，若对于任意的 $\epsilon >0$，存在 $N$ 使得
> $$d(x_{n},x)< \epsilon$$ 对所有的 $n>N$ 成立，则称序列 $\{x_{n}\}$ 收敛于 $x$，记作 $$\lim_{n\rightarrow \infty} x_{n} = x$$ 我们把这种极限存在的序列称为柯西序列，若度量空间 $(M,d)$ 下所有柯西序列的极限值仍在 $M$ 内，则称 $(M,d)$ 为 *complete metric space(完备度量空间)*.

我们举一些例子来说明完备度量空间

- 实数空间 $\mathbb{R}$ 是完备的
- 有理数空间 $\mathbb{Q}$ 不是完备的，例如 $\sqrt{2}$ 的有限位小数表示是一个柯西序列，但是其极限 $\sqrt{2}$ 并不在空间内
- 开区间 $(0,1)$ 不是完备的，例如序列 $\{ \frac{1}{2},\frac{1}{3},\frac{1}{4},\cdots\}$是柯西序列，但是其极限 $0$ 不在空间内

> **Definition 4. Contraction Mapping(压缩映射).** 设 $f$ 为度量空间 $(M,d)$ 上的映射关系，若存在 $\gamma\in[0,1)$ 使得对于任意的 $x_{1},x_{2}\in M$ 有
$$d\left(f\left(x_1\right), f\left(x_2\right)\right) \leq \gamma d\left(x_1, x_2\right)$$ 则称 $f$ 为度量空间 $(M,d)$ 上的压缩映射，可以看到对 $x_{1},x_{2}$ 不断执行压缩映射可以让它们的距离越来越小。

<div></div>

> **Theorem 5. Banach fixed point Theorem(巴拿赫不动点定理)** 设完备度量空间 $(M,d)$ 下的映射关系 $f: X \rightarrow X$ 是一个参数为 $\gamma$ 压缩映射，则 $f$ 有唯一不动点 $x_{*}$，且 $$\lim_{n\rightarrow \infty} f^{n}(x) = x_{*}$$

首先需要证明序列 $x_{n} = f^{n}(x)$ 是柯西序列，我们取序列中的两个值 $x_{a},x_{b}$，且 $b \gg a$，则

$$\begin{aligned}d\left(x_a, x_b\right) 
&\leq d\left(x_a, x_{a-1}\right)+d\left(x_{a-1}, x_b\right)\\
&\leq \sum_{i=a}^{b-1} d(x_{i},x_{i+1}) = \sum_{i=a}^{b-1} d(f(x_{i-1}),f(x_{i}))\\
&\leq \sum_{i=a}^{b-1} \gamma d(x_{i-1},x_{i}) \leq \sum_{i=a}^{b-1} \gamma^{i} d(x_{0},x_{1}) \\
&= d(x_{0},x_{1}) \sum_{i=a}^{b-1} \gamma^{i} =  \frac{\gamma^{a}-\gamma^{b}}{1-\gamma} d\left(x_1, x_0\right)\\
&\leq \frac{\gamma^{a}}{1-\gamma} d\left(x_1, x_0\right)
\end{aligned}$$

由于 $\gamma < 1$，因此对于任意的 $\epsilon$，存在一个足够大的 $a$ 使得

$$d\left(x_a, x_b\right)\leq \frac{\gamma^a}{1-\gamma} d\left(x_1, x_0\right) < \epsilon$$

因此序列 $x_{n}$ 必然收敛，又因为度量空间是完备的，其极限值 $x_{*}$ 必然也在度量空间内，且

$$f(x_{*}) = f\left(\lim _{n \rightarrow \infty} x_n\right)=\lim _{n \rightarrow \infty} f\left(x_n\right)=\lim _{n \rightarrow \infty} x_{n+1}=x^*$$

最后证明唯一性，假设 $f$ 存在两个不动点 $x_{1*},x_{2*}$，则

$$d\left(f\left(x_{1 *}\right), f\left(x_{2 *}\right)\right)=d\left(x_{1 *}, x_{2 *}\right)\leq \gamma d\left(x_{1 *}, x_{2 *}\right)$$

由于 $\gamma < 1$，因此 

$$d\left(x_{1 *}, x_{2 *}\right) = 0 \Rightarrow x_{1*} = x_{2*}$$

---

## *3. Proofs of Bellman Operator*

现在回到贝尔曼算子的问题，只要我们能证明 $\mathcal{T}^\pi(v)$ 是一个完备度量空间下的压缩映射，那么它就是收敛的

> **Theorem 6.** 贝尔曼算子 $$\mathcal{T}^\pi(v)=r_\pi+\gamma P_\pi v$$ 是完备度量空间 $\left(\mathbb{R}^{n}, L_{\infty}\right)$ 下的压缩映射，其中测度函数 $L_{\infty}$ 定义为
> $$d(v_{1},v_{2}) = ||v_{1}-v_{2}||_{\infty} = \max(|v_{1}-v_{2}|)$$

首先 $\left(\mathbb{R}^{n}, L_{\infty}\right)$ 是一个度量空间，因为 $L_{\infty}$ 范数满足测度函数的性质，且价值函数不可能超越实数集的范围，因此该度量空间是完备的。

取空间内的两个任意向量 $v_{1},v_{2}$，有

$$\begin{aligned}
\left\|\mathcal{T}^\pi\left(v_1\right)-\mathcal{T}^\pi\left(v_2\right)\right\|_{\infty} & =\max \left(\left|r_\pi+\gamma P_\pi v_1-\left(r_\pi+\gamma P_\pi v_2\right)\right|\right) \\
& =\gamma \max \left(\left|P_\pi\left(v_1-v_2\right)\right|\right) \\
& \leq \gamma \max \left(P_\pi\left|v_1-v_2\right|\right) \\
& \leq \gamma \max \left(\left|v_1-v_2\right|\right) \\
& =\gamma\left\|v_1-v_2\right\|_{\infty}
\end{aligned}$$
 
这里的两个放缩我们稍作解释，由于矩阵 $P_{\pi}$ 中的元素表示概率，其值域为 $[0,1]$，因此
 
$$\left|P_\pi\left(v_1-v_2\right)\right| \leq \left|P_\pi \right| \left| v_1-v_2\right| = P_\pi \left| v_1-v_2\right|$$
 
而 $P_{\pi}$ 中的行向量表示一个概率分布，因此矩阵乘法本质上是对向量 $\left| v_1-v_2\right|$ 中的元素做了加权平均，因此其最大元素一定变小了，所以

$$\max \left(P_\pi\left|v_1-v_2\right|\right) \leq \max \left(\left|v_1-v_2\right|\right)$$
 
这样我们就证明了 $\mathcal{T}^\pi$ 是一个压缩映射。
 
---

对于贝尔曼最优化方程，我们可以如法炮制，将其写成

$$v_*=\max _\pi\left(r_\pi+\gamma P_\pi v_*\right)$$

定义贝尔曼最优算子 $\mathcal{T}^*: \mathbb{R}^n \rightarrow \mathbb{R}^n$ 为

$$\mathcal{T}^*(v)=\max _\pi\left(r_\pi+\gamma P_\pi v\right)$$
 
> **Theorem 7.** 贝尔曼最优算子 $$\mathcal{T}^*(v)=\max _\pi\left(r_\pi+\gamma P_\pi v\right)$$ 是完备度量空间 $\left(\mathbb{R}^{n}, L_{\infty}\right)$ 下的压缩映射

首先我们证明一个不等式

$$\left|\max _a f(a)-\max _a g(a)\right| \leq \max _a|f(a)-g(a)|$$

设 $a^{*} = \arg\max f(a)$，则

$$\begin{aligned}\max _a f(a)-\max _a g(a) 
&= f(a^{*}) - \max _a g(a) \leq f\left(a^*\right)-g\left(a^*\right) \\
&\leq \left|f\left(a^*\right)-g\left(a^*\right)\right|\leq \max _a|f(a)-g(a)|
\end{aligned}$$

同样的方法可以证明 $\max _a g(a)-\max _a f(a) \leq \max _a|f(a)-g(a)|$，两者结合即可完成证明。

注意到 $\mathcal{T}^*(v) = \max_{\pi}\mathcal{T}^{\pi}(v)$，因此应用上述不等式得到

$$\begin{aligned}\left|\mathcal{T}^*\left(v_1\right)-\mathcal{T}^*\left(v_2\right)\right|
&= \left|\max _\pi \mathcal{T}^\pi(v_1)-\max _\pi \mathcal{T}^\pi(v_2)\right|\\
&\leq \max_{\pi}\left|\mathcal{T}^\pi\left(v_1\right) - \mathcal{T}^\pi\left(v_2\right) \right| \\
&\leq \gamma\max_{\pi} \left(P_\pi\left|v_1-v_2\right|\right)
\end{aligned}$$

因此

$$\begin{aligned}\left\|\mathcal{T}^*\left(v_1\right)-\mathcal{T}^*\left(v_2\right)\right\|_{\infty}
&=\max \left(\left|\mathcal{T}^*\left(v_1\right)-\mathcal{T}^*\left(v_2\right)\right|\right)\\
&\leq \gamma \max(\max _\pi\left(P_\pi\left|v_1-v_2\right|\right))\\
&\leq \gamma \max \left(\left|v_1-v_2\right|\right) \\
&= \gamma\left\|v_1-v_2\right\|_{\infty}
\end{aligned}$$

最后一步的放缩同样是因为 $P_{\pi}$ 中的行向量表示一个概率分布，不论 $\pi$ 怎么取，加权平均的结果一定会变小。

这样我们就证明了 $\mathcal{T}^*(v)$ 也是一个压缩映射。

---

## *Reference*

- https://ai.stackexchange.com/questions/37412/are-my-proofs-that-the-bellman-operators-are-contractions-correct
- https://zhuanlan.zhihu.com/p/419208786
