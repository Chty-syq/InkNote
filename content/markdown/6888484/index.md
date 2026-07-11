---
type: markdown
title: CS229 Note(5) 泛化
slug: "6888484"
order: 27
date: 2023-03-21
updatedAt: 2026-07-10 21:23:01
tags:
  - 机器学习
  - CS229
published: true
category: machine-learning
---

现在我们已经掌握了一些解决问题的有力工具，但是我们还不知道如何运用它们。

接下来的几节中，我们将讲述学习理论，它们在实际操作中非常有用，这也是算法科学家与那些只会摆弄数学公式的书呆子们的区别。

---

## *1. Bias-variance Tradeoff(偏差与方差的权衡)*

<center>
![enter image description here](/content-images/external/12586b4fcf12251679502d71074299a6.png)
</center>

如上图所示，我们使用线性函数来拟合样本数据，但即使训练集中有无穷多的数据，训练得到了最优秀的线性函数，这个函数也总是不能很好地拟合样本数据。

这种现象我们称之为 *underfit(欠拟合)*，这样的算法拥有较高的 *bias(偏差)*.

<center>
![enter image description here](/content-images/external/c1e0677515016aae116499569bfd903a.png)
</center>

如果我们用五次函数来拟合样本数据，虽然训练集拟合的很好，准确无误，但它仍不是一个好的算法，因为它在测试集上的 *variance(方差)* 很高，这种现象我们称之为 *overfit(过拟合)*.

从直观上来讲，我们寻找一个介于线性函数与五次函数之间的函数，可以避免这两种极端情况，事实上，我们可以用数学解释它。

设我们的训练集 $S=\left\{x^{(i)}, y^{(i)}\right\}_{i=1}^n$ 满足 

$$y^{(i)}=h^{\star}\left(x^{(i)}\right)+\xi^{(i)},\quad \xi^{(i)} \sim N\left(0, \sigma^2\right)$$

其中 $ \xi^{(i)}$ 表示样本的随机误差，满足高斯分布，我们在训练集上进行训练得到拟合函数 $h_S(x)$

现在我们从测试集中选取一个样本 $(x,y)$，其误差为

$$\begin{aligned}\operatorname{MSE}(x)
&=\mathbb{E}_{S, \xi}\left[\left(y-h_S(x)\right)^2\right] \\
&=\mathbb{E}\left[\left(\xi+h^{\star}(x)-h_S(x)\right)^2\right] \\
&=\sigma^2+\mathbb{E}\left[\left(h^{\star}(x)-h_S(x)\right)^2\right] \\
&=\sigma^2+\left(h^{\star}(x)-\mathbb{E}(h_{S}(x))\right)^2+\mathbb{E}\left[\left(\mathbb{E}(h_{S}(x))-h_S(x)\right)^2\right] \\
&=\underbrace{\sigma^2}_{\text {unavoidable }}+\underbrace{\left(h^{\star}(x)-\mathbb{E}(h_{S}(x))\right)^2}_{\triangleq \text { bias }^2}+\underbrace{\operatorname{var}\left(h_S(x)\right)}_{\triangleq \text { variance }}
\end{aligned}$$

也就是说，测试误差与偏差的平方和方差正相关。

<center>
![enter image description here](/content-images/external/5730080e1ba71190e7dc501ce1d3d212.png)
</center>

如图所示，当我们使用的拟合模型越复杂时，偏差减小，方差增大，理论上存在一个平衡点使得测试误差最小。

---

## *2. Empirical Risk Minimization(经验风险最小化)*

我们以最经典的 0/1 分类问题为例，假设我们有大小为 $n$ 的训练集 

$$S=\left\{\left(x^{(i)}, y^{(i)}\right) ; i=1, \ldots, n\right\}, y^{(i)}\in\{0,1\}$$

且样本数据是独立同分布的，设它们服从概率分布 $\mathcal{D}$，对于训练得到的预测函数 $h$，我们定义训练误差

$$\hat{\varepsilon}(h)=\frac{1}{n} \sum_{i=1}^n 1\left\{h\left(x^{(i)}\right) \neq y^{(i)}\right\}$$

假设我们使用的是线性分类器，即 $h_\theta(x)=1\left\{\theta^T x \geq 0\right\}$，那么我们的训练目标就是最小化训练误差，得到最优参数

$$\hat{\theta}=\arg \min _\theta \hat{\varepsilon}\left(h_\theta\right)$$

这个过程我们称之为 *Empirical Risk Minimization(经验风险最小化)*，得到的最佳预测函数 $\hat{h}=h_{\hat{\theta}}$

我们将所有可能的预测函数定义为预测函数族

$$\mathcal{H}=\left\{h_\theta: h_\theta(x)=1\left\{\theta^T x \geq 0\right\}, \theta \in \mathbb{R}^{d+1}\right\}$$

那么我们的 *ERM* 可以表达为

$$\hat{h}=\arg \min _{h \in \mathcal{H}} \hat{\varepsilon}(h)$$

接下来我们先讨论 $\mathcal{H}$ 为有限集的情况(虽然大多数情况下它都是无限集).

---

## *3. The case of finite $\mathcal{H}$*

我们首先介绍在本节的推导过程中使用到的两个引理。

> **Lemma 1. Union Bound(联合界引理).** 对于 $k$ 个事件 $A_1, A_2, \ldots, A_k$，有
> $$P\left(A_1 \cup \cdots \cup A_k\right) \leq P\left(A_1\right)+\ldots+P\left(A_k\right)$$

这个引理常常被作为概率学中的公理使用，实际上，如果画一张 *Venn* 图的话，它的正确性是显而易见的。

> **Lemma 2. Hoeffding Inequality(霍夫丁不等式)** 设 $Z_1, \ldots, Z_n$ 为独立同分布的随机变量，它们服从伯努利分布 $B(\phi)$，设它们的均值
> $$\hat{\phi}= \frac{1}{n} \sum_{i=1}^n Z_i$$ 那么对于任意的 $\gamma > 0$，有
> $$P(|\phi-\hat{\phi}|>\gamma) \leq 2 \exp \left(-2 \gamma^2 n\right)$$

在这个不等式中，$\hat{\phi}$ 实际上是我们使用一系列样本 $Z_{i}$ 对 $\phi$ 的真实值做出的一个估计，*Hoeffding* 不等式告诉我们，当 $n$ 足够大时，这个估计值非常接近真实值，这与中心极限定理是一致的。

现在我们假设 $\mathcal{H}$ 中包含 $k$ 个预测函数 $\mathcal{H}=\left\{h_1, \ldots, h_k\right\}$，我们的 *ERM* 从中选取一个使得训练误差最小

$$\hat{h}=\arg \min _{h \in \mathcal{H}} \hat{\varepsilon}(h)$$

现在我们需要证明两件事情

1. 我们的训练误差 $\hat{\varepsilon}$ 是对一般误差 $\varepsilon$ 的良好估计。
2. *ERM* 得到的 $\hat{h}$ 的一般误差存在上界。

我们考虑对于 $\mathcal{H}$ 的一个预测函数 $h_{i}$，设 $Z_{i} = 1\left\{h_i\left(x^{(j)}\right) \neq y^{(j)}\right\}$ 为独立同分布的伯努利随机变量，那么训练误差为

$$\hat{\varepsilon}\left(h_i\right)=\frac{1}{n} \sum_{j=1}^n Z_j$$

根据 *Hoeffding* 不等式，有

$$P\left(\left|\varepsilon\left(h_i\right)-\hat{\varepsilon}\left(h_i\right)\right|>\gamma\right) \leq 2 \exp \left(-2 \gamma^2 n\right)$$

也就是说，如果我们训练集合的大小 $n$ 足够大，那么训练误差与一般误差差距很大的概率会很小。

现在我们证明了对于特定的 $h_{i}$，它的训练误差是对一般误差的一个好的估计，我们接下来证明对于所有的 $h\in \mathcal{H}$ 都成立。

设事件 $A_{i}$ 表示 $\mid \varepsilon\left(h_i\right)-\hat{\varepsilon}\left(h_i\right) \mid>\gamma$，我们已经证明了对于任意指定的 $A_{i}$，有

$$P\left(A_i\right) \leq 2 \exp \left(-2 \gamma^2 n\right)$$

根据联合界引理，有

$$\begin{aligned}
P\left(\exists h \in \mathcal{H} .\left|\varepsilon\left(h_i\right)-\hat{\varepsilon}\left(h_i\right)\right|>\gamma\right) & =P\left(A_1 \cup \cdots \cup A_k\right) \\
& \leq \sum_{i=1}^k P\left(A_i\right) \\
& \leq \sum_{i=1}^k 2 \exp \left(-2 \gamma^2 n\right) \\
& =2 k \exp \left(-2 \gamma^2 n\right)
\end{aligned}$$

我们对两边取反，有

$$\begin{aligned}
P\left(\neg \exists h \in \mathcal{H} .\left|\varepsilon\left(h_i\right)-\hat{\varepsilon}\left(h_i\right)\right|>\gamma\right) & =P\left(\forall h \in \mathcal{H} \cdot\left|\varepsilon\left(h_i\right)-\hat{\varepsilon}\left(h_i\right)\right| \leq \gamma\right) \\
& \geq 1-2 k \exp \left(-2 \gamma^2 n\right)
\end{aligned}$$

也就是说，在不小于 $1-2 k \exp \left(-2 \gamma^2 n\right)$ 的概率下，对于所有 $\mathcal{H}$ 中的预测函数 $h$，它们的训练误差与一般误差的差距都会在 $\gamma$ 以内，我们把这个性质称之为 *uniform convergence(一致收敛)*.

这个结论表明，在训练集很大的条件下，所有的预测函数的训练误差都会与一般误差相近。

现在我们换一种表述，对于给定的 $\gamma,\delta$，我们要保证在至少 $1 - \delta$ 的概率下，训练误差与一般误差的差距不超过 $\gamma$，那么训练集合的大小需要满足

$$n \geq \frac{1}{2 \gamma^2} \log \frac{2 k}{\delta}$$

我们把这个界称为 *sample complexity(样本复杂度)*，需要注意的是，$\log{k}$ 的增长是极其缓慢的，也就是说，预测函数集 $\mathcal{H}$ 的大小对样本复杂度的影响是微乎其微的。

我们再换一种表述，对于给定的 $\delta,n$，我们可以保证在至少 $1 - \delta$ 的概率下，训练误差与一般误差的差距

$$|\hat{\varepsilon}(h)-\varepsilon(h)| \leq \sqrt{\frac{1}{2 n} \log \frac{2 k}{\delta}}$$

我们把这个界称为 *error bound(误差界)*.

现在，我们假设一致收敛性成立，即 $|\varepsilon(h)-\hat{\varepsilon}(h)| \leq \gamma$ 对所有的 $h\in \mathcal{H}$ 成立，我们使用 *ERM* 选取出最优的

$$\hat{h}=\arg \min _{h \in \mathcal{H}} \hat{\varepsilon}(h)$$

我们设 $h^{*}$ 是预测函数集合中拥有最小一般误差的预测函数，即

$$h^*=\arg \min _{h \in \mathcal{H}} \varepsilon(h)$$

两次应用 $|\varepsilon(h)-\hat{\varepsilon}(h)| \leq \gamma$ 可以得到

$$\begin{aligned}
\varepsilon(\hat{h}) & \leq \hat{\varepsilon}(\hat{h})+\gamma \\
& \leq \hat{\varepsilon}\left(h^*\right)+\gamma \\
& \leq \varepsilon\left(h^*\right)+2 \gamma
\end{aligned}$$

也就是说，我们使用 *ERM* 训练得到的 $\hat{h}$ 的一般误差比最优秀的 $h^{*}$ 最多大 $2\gamma$，结合上面的误差界表述，可以得到如下定理

> **Theorem 1.** 设 $\mathcal{H} = k$，对于给定的 $n,\delta$，可以保证在至少 $1-\delta$ 的概率下
> $$\varepsilon(\hat{h}) \leq\left(\min _{h \in \mathcal{H}} \varepsilon(h)\right)+2 \sqrt{\frac{1}{2 n} \log \frac{2 k}{\delta}}$$

根据这个定理，如果我们增大模型的复杂程度，例如将线性分类器换成二次函数，那么第一项的值会减小，而 $k$ 的增大会使第二项的值增大，它们之间有一个 *tradeoff*.

---

## *4. The case of infinite $\mathcal{H}$*

在之前的例子中，我们的线性分类器对应的预测函数集合

$$\mathcal{H}=\left\{h_\theta: h_\theta(x)=1\left\{\theta^T x \geq 0\right\}, \theta \in \mathbb{R}^{d}\right\}$$

其中参数 $\theta$ 是一个 $d$ 维的向量，在计算机中，我们使用 $64bit$ 的浮点数表示向量每一维的数，那么我们需要 $64d$ 个二进制位表示向量 $\theta$，也就是说，集合 $\mathcal{H}$ 的大小为 $2^{64 d}$.

结合上一节中的样本复杂度界，至少有 $1-\delta$ 的概率保证 $\varepsilon(\hat{h}) \leq \varepsilon\left(h^*\right)+2 \gamma$，样本复杂度需要满足

$$n \geq O\left(\frac{1}{\gamma^2} \log \frac{2^{64 d}}{\delta}\right)=O\left(\frac{d}{\gamma^2} \log \frac{1}{\delta}\right)=O_{\gamma, \delta}(d)$$

也就是说，在线性分类器中，需要的训练样本的数量与模型的参数数量成正比。

但是这里我们可以卡一个 *bug*，取预测函数

$$h_{u, v}(x)=1\left\{\left(u_0^2-v_0^2\right)+\left(u_1^2-v_1^2\right) x_1+\cdots\left(u_d^2-v_d^2\right) x_d \geq 0\right\}$$

我们发现这个 $h_{u,v}$ 和上面的 $h_{\theta}$ 是完全等价的，但是它却有 $2d$ 个参数，所以参数的数量并不足以刻画 $\mathcal{H}$ 的复杂程度。

> **Definion 1. Shattering(分散).** 对于给定的点集 
$$S=\left\{x^{(1)}, \ldots, x^{(\mathbf{D})}\right\}, \quad x^{(i)}\in \mathcal{X}$$ 我们称预测函数集 $\mathcal{H}$ *shatters(分散)* $S$，当且仅当 $\mathcal{H}$ 可以实现 $S$ 的任意一种标记方式，即对于任意的标签集合
$$\left\{y^{(1)}, \ldots, y^{(\mathbf{D})}\right\},\quad y^{(i)}\in \{0,1\}$$ 存在一个 $h\in\mathcal{H}$ 使得对于所有的 $i=1,\ldots,D$，有 $h\left(x^{(i)}\right)=y^{(i)}$.

<div></div>

> **Definion 2. Vapnik-Chervonenkis Dimension(VC维度).** 给定预测函数集 $\mathcal{H}$，我们定义它的 *VC-dimension* 为 $\mathcal{H}$ 能够分散的最大集合的大小，即
> $$\operatorname{VC}(\mathcal{H}) = \max_{S:\text{  } \mathcal{H} \text{ shatters } S} |S|$$

我们看一个例子，在二维平面上，我们考虑线性分类器 $\mathcal{H}$ 中的函数

$$h(x)=1\left\{\theta_0+\theta_1 x_1+\right.\left.\theta_2 x_2 \geq 0\right\}$$

它是可以分散包含三个点的点集 $S$ 的，如图所示

<center>
![enter image description here](/content-images/external/edcf4a9d1568fc782f2a37553e3d2f2b.png)
</center>

这三个点的标签一共有 8 种情况，每一种情况都存在一条直线将不同的标签划分开来。

当然如果这三个点共线的话，是不成立的，但是存在大小为 3 的符合条件的 $S$，因此 $\operatorname{VC}(\mathcal{H})$ 至少为 3.

可以证明(其实把图画出来是显而易见的)，不存在大小为 $4$ 的点集 $S$ 可以被 $\mathcal{H}$ 分散，因此 $\operatorname{VC}(\mathcal{H})=3$.

现在我们可以用 *VC-dimension* 来刻画预测函数集 $\mathcal{H}$ 的复杂程度，并有如下定理

> **Theorem 2.** 给定预测函数集 $\mathcal{H}$，且 $\mathrm{D}=\operatorname{VC}(\mathcal{H})$，至少有 $1-\delta$ 的概率，可以保证对于所有的 $h \in \mathcal{H}$，有
> $$|\varepsilon(h)-\hat{\varepsilon}(h)| \leq O\left(\sqrt{\frac{\mathbf{D}}{n} \log \frac{n}{\mathbf{D}}+\frac{1}{n} \log \frac{1}{\delta}}\right) .$$

也就是说，如果预测函数集 $\mathcal{H}$ 的 *VC-dimension* 是有限的，那么当训练样本足够大时，一致收敛性成立。

按照之前的流程，我们同样可以写出样本复杂度界

$$n=O_{\gamma, \delta}(\mathbf{D})$$

即训练所需的样本数量与模型 $\mathcal{H}$ 的 *VC-dimension* 成正比。

在实际工程中，$\mathbf{D}$ 的大小与模型的参数通常是差不多的，例如使用 *logistic* 回归做线性分类，维度为 $n$ 的 *logistic* 回归需要 $n+1$ 个参数，$\mathbf{D}$ 的大小也是 $n+1$

---

## *5. Furthermore(要填的坑)*

- *Hoeffding* 不等式的证明
- *VC-dimension* 引出的一致收敛性，即 *Theorem 2* 的证明
- *SVM* 模型的 *VC-dimension*
