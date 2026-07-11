---
type: markdown
title: CS229 Note(8) 因子分析
slug: "6854416"
order: 22
date: 2023-06-21
updatedAt: 2026-07-10 20:58:15
tags:
  - 机器学习
  - CS229
published: true
category: machine-learning
---

## *1. The Singular Varience(不可逆的方差)*

在之前关于 *EM* 算法的讨论中，我们是做了一个假设的，那就是数据集的大小 $n$ 远远大于数据的维度 $d$，如果不满足的话会发生什么呢？

考虑 $d \gg n$ 的场景，我们用高斯分布来建模数据集 $\{x^{(i)}\}$，考虑其均值与方差

$$\begin{aligned}
\mu & =\frac{1}{n} \sum_{i=1}^n x^{(i)} \\
\Sigma & =\frac{1}{n} \sum_{i=1}^n\left(x^{(i)}-\mu\right)\left(x^{(i)}-\mu\right)^T
\end{aligned}$$

我们惊讶的发现协方差矩阵 $\Sigma$ 非常稀疏，极有可能不满秩，因此我们无法写出这个高斯分布的 *CDF(概率密度函数)*，如此也就不能对其进行极大似然估计。

考虑对协方差矩阵 $\Sigma$ 做出限制，比如令其为对角阵 $\Sigma = \operatorname{diag}(\sigma_{1}^{2}, \ldots, \sigma_{d}^{2})$，其中

$$\sigma_{j} = \frac{1}{n} \sum_{i=1}^n\left(x_j^{(i)}-\mu_j\right)^2$$

也就是说我们放弃了数据各个维度间的相关性，假设它们相互独立，以此为代价换来了 $\Sigma$ 可逆。

这并不是一个好的模型，我们希望有一个介于两者之间的模型，它既可以捕获到某些维度间的相关性，又无需拟合完整的 $\Sigma$，这就是我们接下来要介绍的 *factor analysis model(因子分析模型)*.

---

## *2. Marginals And Conditionals of Gaussians(边际分布与条件分布)*

在讲述因子分析模型之前，我们先介绍求解多元高斯分布的边际分布与条件分布的做法。

> **Theorem 1.** 设随机变量
> $$x=\left[\begin{array}{l}
x_1 \\
x_2
\end{array}\right],\quad x_1 \in \mathbb{R}^r, x_2 \in \mathbb{R}^s, x \in \mathbb{R}^{r+s}$$ 服从高斯分布 $x \sim N(\mu, \Sigma)$，其中
> $$\mu=\left[\begin{array}{l}
\mu_1 \\
\mu_2
\end{array}\right], \quad \Sigma=\left[\begin{array}{ll}
\Sigma_{11} & \Sigma_{12} \\
\Sigma_{21} & \Sigma_{22}
\end{array}\right]$$
> 将 $x$ 看做 $x_{1},x_{2}$ 的联合分布，则 $x_{1}$ 的边际分布服从
> $$x_{1} \sim N(\mu_{1}, \Sigma_{1})$$ 条件分布 $x_{1}|x_{2}$ 服从
> $$x_1 | x_2 \sim N\left(\mu_{1 | 2}, \Sigma_{1 | 2}\right)$$ 其中
> $$\begin{aligned}
\mu_{1 | 2} & =\mu_1+\Sigma_{12} \Sigma_{22}^{-1}\left(x_2-\mu_2\right) \\
\Sigma_{1 | 2} & =\Sigma_{11}-\Sigma_{12} \Sigma_{22}^{-1} \Sigma_{21}
\end{aligned}$$

证明较为繁琐，我们将在附录中证明它。

---

## *3. The Factor Analysis Model(因子分析模型)*

为了解决数据样本过少的问题，我们引入 *latent random variable(隐藏随机变量)* $z\in\mathbb{R}^{k}$，这里往往选择 $k<d$，假设联合分布 $(x,z)$ 服从

$$\begin{aligned}
z & \sim N(0, I) \\
x | z & \sim N(\Lambda z, \Psi)
\end{aligned}$$

其中 $\Lambda \in \mathbb{R}^{d \times k},\Psi \in \mathbb{R}^{d \times d}$，样本点的 $x^{(i)}$ 的生成可以看做如下过程:

- 从 $N(0, I)$ 中采样出一个 $z^{(i)}$.
- 使用 $\Lambda z$ 将 $z^{(i)}$ 映射到 $d$ 维空间下的点。
- 给这个点加上方差为 $\Psi$ 的噪声 $\epsilon$ 得到 $x^{(i)}$.

因此，等价的，我们可以写出因子分析模型

$$\begin{aligned}
z & \sim \mathcal{N}(0, I) \\
\epsilon & \sim \mathcal{N}(0, \Psi) \\
x & =\Lambda z+\epsilon
\end{aligned}$$

根据 *Theorem 1*，我们知道联合分布 $(z,x)$ 也是一个高斯分布，我们需要计算它的均值与方差。均值是显然的

$$\mu_{z x}=
\left[\begin{array}{l}
\mathbb{E}(z) \\
\mathbb{E}(x)
\end{array}\right]
=\left[\begin{array}{l}
\overrightarrow{0} \\
\overrightarrow{0}
\end{array}\right]$$

方差的计算有些繁琐

$$\begin{aligned} \operatorname{Cov}(z,x) 
& = \mathbb{E}\left[(z-\mathbb{E}[z])(x-\mathbb{E}[x])^T\right] \\
& =\mathbb{E}\left[z(\Lambda z+\epsilon)^T\right] \\
& =\mathbb{E}\left[z z^T\right] \Lambda^T+\mathbb{E}\left[z \epsilon^T\right] \\
& =\Lambda^T
\end{aligned}$$

$$\begin{aligned} \operatorname{Cov}(x,x) 
&= \mathbb{E}\left[(x-\mathbb{E}[x])(x-\mathbb{E}[x])^T\right] \\
& =\mathbb{E}\left[(\Lambda z+\epsilon)(\Lambda z+\epsilon)^T\right] \\
& =\mathbb{E}\left[\Lambda z z^T \Lambda^T+\epsilon z^T \Lambda^T+\Lambda z \epsilon^T+\epsilon \epsilon^T\right] \\
& =\Lambda \mathbb{E}\left[z z^T\right] \Lambda^T+\mathbb{E}\left[\epsilon \epsilon^T\right] \\
& =\Lambda \Lambda^T+\Psi
\end{aligned}$$

因此

$$\Sigma_{zx} = 
\left[\begin{array}{cc}
\operatorname{Cov}(z,z) & \operatorname{Cov}(z,x) \\
\operatorname{Cov}(x,z) & \operatorname{Cov}(x,x)
\end{array}\right]
= \left[\begin{array}{cc}
I & \Lambda^T \\
\Lambda & \Lambda \Lambda^T+\Psi
\end{array}\right]$$

所以，合在一起就是

$$\left[\begin{array}{l}
z \\
x
\end{array}\right] \sim N\left(\left[\begin{array}{c}
\overrightarrow{0} \\
\overrightarrow{0}
\end{array}\right],\left[\begin{array}{cc}
I & \Lambda^T \\
\Lambda & \Lambda \Lambda^T+\Psi
\end{array}\right]\right)$$

所以边际分布 $x\sim N\left(0, \Lambda \Lambda^T+\Psi\right)$，因此在数据集 $x^{(i)}$ 上，有似然函数

$$\ell(\Lambda, \Psi)=\log \prod_{i=1}^n \frac{1}{(2 \pi)^{\frac{d}{2}}\left|\Lambda \Lambda^T+\Psi\right|^{\frac{1}{2}}} \exp \left(-\frac{1}{2}x^{(i)^{T}}\left(\Lambda \Lambda^T+\Psi\right)^{-1}x^{(i)}\right)$$

如果用极大似然方法来估计这些参数的值，我们发现它的计算困难重重，且没有解析解，因此考虑使用 *EM* 算法进行求解。

---

## *4. EM for Factor Analysis(因子分析的EM算法)*

> **Problem 2. Factor Analysis Model(因子分析模型).** 给定数据集 $\{x^{(1)},\ldots,x^{(n)}\}$，我们希望对 $p(x)$ 建模，设隐藏随机变量 $z\in \mathbb{R}^{d}$ 服从高斯分布 $N(0,I)$，随机噪声 $\epsilon \sim N(0,\Psi)$，且
> $$x=\Lambda z+\epsilon$$ 其中各参数 $\Lambda \in \mathbb{R}^{d \times k}, \Psi \in \mathbb{R}^{d \times d}$，且 $\Psi$ 为对角阵，则
> $$\left[\begin{array}{l}
z \\
x
\end{array}\right] \sim N\left(\left[\begin{array}{l}
\overrightarrow{0} \\
\overrightarrow{0}
\end{array}\right],\left[\begin{array}{cc}
I & \Lambda^T \\
\Lambda & \Lambda \Lambda^T+\Psi
\end{array}\right]\right)$$ 我们需要找到各参数的最优解。

我们给出了因子分析模型的一个形式化描述，考虑用 *EM* 算法来求解它。

在 *E-Step* 中，我们需要计算

$$Q_i\left(z^{(i)}\right)=P\left(z^{(i)} | x^{(i)} \right)$$

我们知道高斯联合分布的条件分布也是高斯分布，即 $z^{(i)} | x^{(i)} \sim N\left(\mu_{z^{(i)} | x^{(i)}}, \Sigma_{z^{(i)} | x^{(i)}}\right)$，根据 *Theorem 1*，可以得到

$$\begin{aligned}
\mu_{z^{(i)} | x^{(i)}} & =\Lambda^T\left(\Lambda \Lambda^T+\Psi\right)^{-1}x^{(i)} \\
\Sigma_{z^{(i)} | x^{(i)}} & =I-\Lambda^T\left(\Lambda \Lambda^T+\Psi\right)^{-1} \Lambda
\end{aligned}$$

因此可以写出

$$Q_i\left(z^{(i)}\right)=\frac{1}{(2 \pi)^{\frac{k}{2}} \left|\Sigma_{z^{(i)}|x^{(i)}}\right|^{\frac{1}{2}} } \exp \left(-\frac{1}{2}\left(z^{(i)}-\mu_{z^{(i)} | x^{(i)}}\right)^T \Sigma_{z^{(i)} | x^{(i)}}^{-1}\left(z^{(i)}-\mu_{z^{(i)} | x^{(i)}}\right)\right)$$

在 *M-Step* 中，我们需要极大化目标函数

$$\begin{aligned} \ell(\Lambda, \Psi)
&= \sum_{i=1}^n \int_{z^{(i)}} Q_i\left(z^{(i)}\right) \log \frac{P\left(x^{(i)}, z^{(i)} ;\Lambda, \Psi\right)}{Q_i\left(z^{(i)}\right)} d z^{(i)} \\
&= \sum_{i=1}^n \mathbb{E}_{z^{(i)} \sim Q_i}\left[\log P\left(x^{(i)} | z^{(i)} ;\Lambda, \Psi\right)+\log P\left(z^{(i)}\right)-\log Q_i\left(z^{(i)}\right)\right]
\end{aligned}$$

我们来观察一下这些项，首先 $x^{(i)} | z^{(i)} \sim N(\Lambda z^{(i)}, \Psi)$，可以写出它的表达式，而后面两项都是与参数无关的，因此

$$\begin{aligned} \ell(\Lambda, \Psi)
&= \sum_{i=1}^n \mathbb{E}_{z^{(i)} \sim Q_i}\left[\log P\left(x^{(i)} | z^{(i)} ; \Lambda, \Psi\right)\right] \\
&= \sum_{i=1}^n \mathbb{E}\left[\log \frac{1}{(2 \pi)^{\frac{d}{2}}|\Psi|^{\frac{1}{2}}} \exp \left(-\frac{1}{2}\left(x^{(i)}-\Lambda z^{(i)}\right)^T \Psi^{-1}\left(x^{(i)}-\Lambda z^{(i)}\right)\right)\right] \\
&= \sum_{i=1}^n \mathbb{E}\left[-\frac{1}{2} \log |\Psi|-\frac{n}{2} \log (2 \pi)-\frac{1}{2}\left(x^{(i)}-\Lambda z^{(i)}\right)^T \Psi^{-1}\left(x^{(i)}-\Lambda z^{(i)}\right)\right]
\end{aligned}$$

然后就是愉快的微分时间了（参考[矩阵微分学](http://blog.leanote.com/post/chty_syq/Matrix-Calculus)）

$$\begin{aligned} \nabla_{\Lambda}\ell(\Lambda, \Psi)
& =\nabla_{\Lambda} \sum_{i=1}^n\mathbb{E}\left[-\frac{1}{2}\left(x^{(i)}-\Lambda z^{(i)}\right)^T \Psi^{-1}\left(x^{(i)}-\Lambda z^{(i)}\right)\right] \\
& =\sum_{i=1}^n \nabla_{\Lambda} \mathbb{E}\left[-\frac{1}{2}\operatorname{tr} \left( z^{(i)^T} \Lambda^T \Psi^{-1} \Lambda z^{(i)}\right)+\operatorname{tr} \left(z^{(i)^T} \Lambda^T \Psi^{-1}x^{(i)}\right)\right] \\
& =\sum_{i=1}^n \nabla_{\Lambda} \mathbb{E}\left[-\frac{1}{2}\operatorname{tr}\left(   \Lambda z^{(i)} z^{(i)^T}\Lambda^T \Psi^{-1}\right)+\operatorname{tr}\left( \Lambda^T \Psi^{-1}x^{(i)} z^{(i)^T}\right)\right] \\
& =\sum_{i=1}^n \mathbb{E}\left[-\Psi^{-1} \Lambda z^{(i)} z^{(i)^T}+\Psi^{-1}x^{(i)} z^{(i)^T}\right] \\
& =\sum_{i=1}^n -\Psi^{-1} \Lambda \mathbb{E}\left[z^{(i)} z^{(i)^T}\right]+\Psi^{-1}x^{(i)}\mathbb{E}\left[ z^{(i)^T}\right]
\end{aligned}$$

这里用到了两个矩阵微分的结论

$$\begin{aligned} \nabla_A \operatorname{tr} A B A^T C&=C A B+C^T A B \\
\nabla_A \operatorname{tr} A^T B&=B
\end{aligned}$$

由于协方差 

$$\operatorname{Cov}(z) = \mathbb{E}[zz^{T}] - \mathbb{E}[z]\mathbb{E}^{T}[z]$$

得到

$$\begin{aligned}
\mathbb{E}\left[z^{(i)^T}\right] & =\mu_{z^{(i)} \mid x^{(i)}}^T \\
\mathbb{E}\left[z^{(i)} z^{(i)^T}\right] & =\mu_{z^{(i)} \mid x^{(i)}} \mu_{z^{(i)} \mid x^{(i)}}^T+\Sigma_{z^{(i)} \mid x^{(i)}}
\end{aligned}$$

令梯度为 $0$ 得到

$$\Lambda=\frac{\sum_{i=1}^n x^{(i)} \mathbb{E}\left[z^{(i)^T}\right]}{\sum_{i=1}^n \mathbb{E}\left[z^{(i)} z^{(i)^T}\right]} $$

接下来是 $\Psi$ 的微分，这里的计算有一些技巧性，为了计算方便，我们选择计算 $\Psi^{-1}$ 的梯度。

首先处理 $\log |\Psi|$ 项，由于 $\Psi$ 是对角阵，有

$$\log \left|\Psi^{T} \Psi\right|=\log |\Psi^{T}||\Psi|=2 \log |\Psi|$$

所以根据 *[Matrix Cookbook](https://www.math.uwaterloo.ca/~hwolkowi/matrixcookbook.pdf)* 中的 $56$ 号公式有

$$\nabla_{\Psi^{-1}} \log |\Psi| = \frac{1}{2}\nabla_{\Psi^{-1}}\log \left|\Psi^{T} \Psi\right| = -\Psi$$

因此

$$\begin{aligned} \nabla_{\Psi^{-1}}\ell(\Lambda, \Psi)
& =\nabla_{\Psi^{-1}} \sum_{i=1}^n\mathbb{E}\left[-\frac{1}{2} \log |\Psi| -\frac{1}{2}\left(x^{(i)}-\Lambda z^{(i)}\right)^T \Psi^{-1}\left(x^{(i)}-\Lambda z^{(i)}\right)\right] \\
& =\frac{n}{2}\Psi -\frac{1}{2}\sum_{i=1}^n \nabla_{\Psi^{-1}} \mathbb{E}\left[\operatorname{tr} \left( \left(x^{(i)}-\Lambda z^{(i)}\right) \left(x^{(i)}-\Lambda z^{(i)}\right)^T \Psi^{-1} \right)\right] \\
& =\frac{n}{2}\Psi -\frac{1}{2}\sum_{i=1}^n \mathbb{E}\left[ \left(x^{(i)}-\Lambda z^{(i)}\right) \left(x^{(i)}-\Lambda z^{(i)}\right)^T\right] \\
& = \frac{n}{2}\Psi -\frac{1}{2}\sum_{i=1}^n \mathbb{E}\left[x^{(i)}x^{(i)^{T}} - 2x^{(i)}z^{(i)^{T}}\Lambda^{T}  + \Lambda z^{(i)}z^{(i)^{T}} \Lambda^{T} \right] \\
& = \frac{n}{2}\Psi -\frac{1}{2}\sum_{i=1}^n \left\{x^{(i)}x^{(i)^{T}}- 2x^{(i)} \mathbb{E}\left[ z^{(i)^{T}} \right] \Lambda^{T}  + \Lambda \mathbb{E}\left[z^{(i)}z^{(i)^{T}}\right] \Lambda^{T}\right\} 
\end{aligned}$$

注意到大括号里的最后一项的形式和上面 $\Lambda$ 的解有些相似

$$\Lambda\sum_{i=1}^n \mathbb{E}\left[z^{(i)} z^{(i)^T}\right]= \sum_{i=1}^n x^{(i)} \mathbb{E}\left[z^{(i)^T}\right]$$

代入上式，并令梯度等于 $0$ 得到

$$\Psi = \frac{1}{n}\sum_{i=1}^n \left\{x^{(i)}x^{(i)^{T}}- x^{(i)} \mathbb{E}\left[ z^{(i)^{T}} \right] \Lambda^{T} \right\} $$

最后再加上 $\Psi$ 是对角阵的限制条件得到

$$\Psi = \frac{1}{n}\operatorname{diag}\left(\sum_{i=1}^n \left\{x^{(i)}x^{(i)^{T}}- x^{(i)} \mathbb{E}\left[ z^{(i)^{T}} \right] \Lambda^{T} \right\}\right) $$

---

## *Appendix: Proof of Theorem 1*

在本节中使用如下描述的符号，设随机变量

$$x=\left[\begin{array}{l}
x_1 \\
x_2
\end{array}\right],\quad x_1 \in \mathbb{R}^r, x_2 \in \mathbb{R}^s, x \in \mathbb{R}^{r+s}$$ 

服从高斯分布 $x \sim N(\mu, \Sigma)$，其中

$$\mu=\left[\begin{array}{l}
\mu_1 \\
\mu_2
\end{array}\right], \quad \Sigma=\left[\begin{array}{ll}
\Sigma_{11} & \Sigma_{12} \\
\Sigma_{21} & \Sigma_{22}
\end{array}\right]$$

> **Lemma 3.** 设 *schur complement(舒尔补)* $\Sigma_{*} = \Sigma_{11}-\Sigma_{12} \Sigma_{22}^{-1} \Sigma_{21}$，可以写出逆矩阵
> $$\begin{aligned}\Sigma^{-1}
&=\left[\begin{array}{ll}
\Sigma_{11} & \Sigma_{12} \\
\Sigma_{21} & \Sigma_{22}
\end{array}\right]^{-1}=\left[\begin{array}{ll}
\Sigma_{11}^* & \Sigma_{12}^* \\
\Sigma_{21}^* & \Sigma_{22}^*
\end{array}\right]\\
&= 
\left[\begin{array}{ll}
\Sigma_*^{-1} & -\Sigma_*^{-1} \Sigma_{12} \Sigma_{22}^{-1} \\
-\Sigma_{22}^{-1} \Sigma_{21} \Sigma_*^{-1} & \Sigma_{22}^{-1}+\Sigma_{22}^{-1} \Sigma_{21} \Sigma_*^{-1} \Sigma_{12} \Sigma_{22}^{-1}
\end{array}\right]
\end{aligned}$$ 设 *conditional mean vector(条件均值向量)*
> $$\mu_* = \mu_1+\Sigma_{12} \Sigma_{22}^{-1}\left(x_2-\mu_2\right)$$ 则 *Mahalanobis distance(马氏距离)* 满足如下分解式
> $$\begin{aligned}(x-\mu)^{\mathrm{T}} \Sigma^{-1}(x-\mu) 
= &\left(x_1-\mu_*\right)^{\mathrm{T}} \Sigma_*^{-1}\left(x_1-\mu_*\right) + \\
 &\left(x_2-\mu_2\right)^{\mathrm{T}} \Sigma_{22}^{-1}\left(x_2-\mu_2\right)
\end{aligned}$$

证明：只需将各量代入即可

$$\begin{aligned}(x-\mu)^{\mathrm{T}} \Sigma^{-1}(x-\mu)
&= \left[\begin{array}{l}
x_1-\mu_1 \\
x_2-\mu_2
\end{array}\right]^{\mathrm{T}}\left[\begin{array}{ll}
\Sigma_{11}^* & \Sigma_{12}^* \\
\Sigma_{21}^* & \Sigma_{22}^*
\end{array}\right]\left[\begin{array}{l}
x_1-\mu_1 \\
x_2-\mu_2
\end{array}\right] \\
&= \left(x_1-\mu_1\right)^{\mathrm{T}} \Sigma_{11}^*\left(x_1-\mu_1\right)+\left(x_1-\mu_1\right)^{\mathrm{T}} \Sigma_{12}^*\left(x_2-\mu_2\right) +\left(x_2-\mu_2\right)^{\mathrm{T}} \Sigma_{21}^*\left(x_1-\mu_1\right)+\left(x_2-\mu_2\right)^{\mathrm{T}} \Sigma_{22}^*\left(x_2-\mu_2\right) \\
&= \left(x_1-\left(\mu_1+\Sigma_{12} \Sigma_{22}^{-1}\left(x_2-\mu_2\right)\right)\right)^{\mathrm{T}} \Sigma_*^{-1}\left(x_1-\left(\mu_1+\Sigma_{12} \Sigma_{22}^{-1}\left(x_2-\mu_2\right)\right)\right) +\left(x_2-\mu_2\right)^{\mathrm{T}} \Sigma_{22}^{-1}\left(x_2-\mu_2\right) \\
&= \left(x_1-\mu_*\right)^{\mathrm{T}} \Sigma_*^{-1}\left(x_1-\mu_*\right)+\left(x_2-\mu_2\right)^{\mathrm{T}} \Sigma_{22}^{-1}\left(x_2-\mu_2\right)
\end{aligned}$$

有了这个引理，我们就可以非常简洁的证明 *Theorem 1*.

> **Theorem 1.** 条件分布 $x_{1}|x_{2}$ 服从
> $$x_1 | x_2 \sim N\left(\mu_{*}, \Sigma_{*}\right)$$

我们写出概率表达式即可证明

$$\begin{aligned}P(x_{1}|x_{2}) 
&= \frac{P(x_{1},x_{2})}{P(x_{2})} \\
&= \frac{\frac{1}{(2 \pi)^{\frac{r+s}{2}}|\Sigma|^{\frac{1}{2}}} \exp \left(-\frac{1}{2}\left(x-\mu\right)^T \Sigma^{-1}\left(x-\mu\right)\right)}{\frac{1}{(2 \pi)^{\frac{s}{2}}|\Sigma_{22}|^{\frac{1}{2}}} \exp \left(-\frac{1}{2}\left(x_{2}-\mu_{2}\right)^T \Sigma_{22}^{-1}\left(x_{2}-\mu_{2}\right)\right)} \\
&= \frac{1}{(2 \pi)^{\frac{r}{2}}|\Sigma_{*}|^{\frac{1}{2}}} \exp \left(-\frac{1}{2}\left(x_{1}-\mu_{*}\right)^T \Sigma_{*}^{-1}\left(x_{1}-\mu_{*}\right)\right)
\end{aligned}$$

在最后一步中，我们用了 *Lemma 1*，以及一个行列式的变换

$$\begin{aligned} |\Sigma|
&= \left[\begin{array}{ll}
\Sigma_{11} & \Sigma_{12} \\
\Sigma_{21} & \Sigma_{22}
\end{array}\right] \overset{C_{1} - C_{2}\Sigma_{22}^{-1}\Sigma_{21}}{=} \left[\begin{array}{ll}
\Sigma_{*} & \Sigma_{12} \\
0 & \Sigma_{22}
\end{array}\right] = |\Sigma_{*}| |\Sigma_{22}|
\end{aligned}$$

---

## *Furthermore*

- *schur complement* 和分块矩阵逆
- 证明 [Matrix Cookbook](https://www.math.uwaterloo.ca/~hwolkowi/matrixcookbook.pdf) 中的公式 $56$
- 矩阵微分学进阶方法论

---

## *Reference*

- https://cs229.stanford.edu/summer2019/cs229-notes9.pdf
- https://stats.stackexchange.com/questions/30588/deriving-the-conditional-distributions-of-a-multivariate-normal-distribution
- https://en.wikipedia.org/wiki/Schur_complement
- https://gregorygundersen.com/blog/2018/08/08/factor-analysis/
- https://chrisyeh96.github.io/2021/05/19/schur-complement.html
- https://www.math.uwaterloo.ca/~hwolkowi/matrixcookbook.pdf
