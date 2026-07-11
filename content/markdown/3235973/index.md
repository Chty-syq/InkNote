---
type: markdown
title: CS229 Note(7) 无监督学习
slug: "3235973"
order: 25
date: 2023-05-22
updatedAt: 2026-07-10 21:23:01
tags:
  - 机器学习
  - CS229
published: true
category: machine-learning
---

之前所介绍的机器学习算法都是在给定数据集 $\left\{x^{(1)}, \ldots, x^{(n)}\right\}$，并已知其对应的标签 $\left\{y^{(1)}, \ldots, y^{(n)}\right\}$ 的情况下进行的，这样的算法我们叫做 *supervised learning(监督学习)*.

在监督学习中，标签 $y^{(i)}$ 作为 *ground truth(真值)* 来监督参数的学习过程，正如一座灯塔为算法指明了学习的方向。

现在我们要讨论另一种算法，我们仅给定数据集 $\left\{x^{(1)}, \ldots, x^{(n)}\right\}$，但是没有对应的标签 $y^{(i)}$，我们需要根据数据的特征将它们区分开来，这样的算法就是 *unsupervised learning(无监督学习)*.

---

## *1. The k-means Algorithm*

> **Problem 1. Clustering(聚类).** 给定 $d$ 维空间内的一个点集 $\left\{x^{(1)}, \ldots, x^{(n)} \right\}$，其中 $x^{(i)}\in \mathbb{R}^{d}$，我们需要将其划分为 $k$ 个类，使得同一类的点具有相似的特征，而不同类的点具有不同的特征。

聚类问题有很多常见的应用，例如

- 在生物学中，常常需要对基因进行聚类，来分析不同基因对应的生物功能。
- 在数据库中，保存了许多用户的行为，常常需要对这些数据进行聚类来辅助制定销售策略。
- [news.google.com](news.google.com)使用聚类算法根据相关性对新闻进行分组。

我们有一个算法来解决聚类问题

> **Method 2. k-Means.** *k-means* 算法的思想是维护每个类的中心点，使类中的点到中心点的距离之和最短，算法流程如下
>
> 1. 随机初始化每个类的中心点 $\mu_1, \mu_2, \ldots, \mu_k \in \mathbb{R}^d$
> 2. 根据最小距离计算每个点的所属类：$$c^{(i)}=\arg \min _j\left\|x^{(i)}-\mu_j\right\|^2$$
> 3. 更新每个类的中心点：$$\mu_j=\frac{\sum_{i=1}^n I\left\{c^{(i)}=j\right\} x^{(i)}}{\sum_{i=1}^n I\left\{c^{(i)}=j\right\}}$$
> 4. 重复执行2-3直至算法收敛

下图展示了一个 *k-means* 算法的执行过程的例子

<center> <img src="/content-images/external/0739deb4200692a21d787c459646ef13.png" height=350px></img>
</center>

我们如何保证上述的算法能够收敛呢？定义 *distortion function(失真函数)*

$$J(c, \mu)=\sum_{i=1}^n\left\|x^{(i)}-\mu_{c^{(i)}}\right\|^2$$

我们发现 *k-means* 算法本质上是对函数 $J(c, \mu)$ 做 *coordinate descent(坐标下降)* 的过程，可以收敛到局部最优解，要找到全局最优解，需要调整中心点 $\mu$ 的初始值。

另一个问题是如何选择类的数量 $k$ 呢？

实际上，对于很多聚类问题，类的数量是一个非常模糊的概念，不同的人对于同一数据集有不同的划分，因此 $k$ 使用随机值即可。

---

## *2. Mixture of Gaussians(高斯混合模型)*

> **Problem 3. Density Estimation(密度估计).** 给定数据集 $S=\left\{x^{(1)}, \ldots, x^{(n)}\right\}$，现在有新采集到的数据 $x^{*}$，我们需要判断 $x^{*}$ 在 $S$ 中是否异常。

密度估计问题常常被应用在异常检测中，例如飞机异常零件的检测。一种常规的方法是对数据集 $S$ 进行建模，得到其概率密度函数 $P(x)$

- $P(x^{*})$ 的值越大，则更有把握说明 $x^{*}$ 为正常数据。
- $P(x^{*})$ 的值越小，则更有把握说明 $x^{*}$ 为异常数据。

现在的问题就是要找到一个算法估计出 $S$ 的概率分布 $P(x)$，为了描述这个算法，我们先来看一个一维的例子。

> **Problem 4. Mixture of Gaussians(高斯混合模型).** 在数据集 $\left\{x^{(1)}, \ldots, x^{(n)}\right\}$ 上，我们用一个不可观测的随机变量 $z^{(i)}\in \{1,2,\ldots,k\}$ 表示 $x^{(i)}$ 的所属类，则 $$z^{(i)} \sim \operatorname{Multinomial}(\phi),\quad \phi_j \geq 0, \sum_{j=1}^k \phi_j=1$$ 我们的目标是估计出这些数据的所属类，假设每个类 $j$ 中的数据都符合高斯分布 $\mathcal{N}\left(\mu_j, \Sigma_j\right)$，即
> $$P(x^{(i)} | z^{(i)}=j) \sim \mathcal{N}\left(\mu_j, \Sigma_j\right)$$ 我们可以描述出 $x^{(i)},z^{(i)}$ 的联合概率分布
> $$P(x^{(i)}, z^{(i)})=P(x^{(i)} | z^{(i)}) P(z^{(i)})$$ 其 $x^{(i)}$ 侧的边际分布为
> $$P(x^{(i)}) = \sum_{j=1}^k P\left(x^{(i)} | z^{(i)} = j\right) P\left(z^{(i)} = j\right)$$

我们可以写出其对数似然函数

$$\begin{aligned}
\ell(\phi, \mu, \Sigma) & =\sum_{i=1}^n \log P\left(x^{(i)} ; \phi, \mu, \Sigma\right) \\
& =\sum_{i=1}^n \log \sum_{j=1}^k P\left(x^{(i)} | z^{(i)} = j ; \mu, \Sigma\right) P\left(z^{(i)} = j ; \phi\right)\\
& =\sum_{i=1}^n \log \sum_{j=1}^k P\left(x^{(i)} | z^{(i)} = j ; \mu, \Sigma\right) \phi_{j}
\end{aligned}$$

首先回顾一下高斯分布

$$N(x;\mu, \Sigma) = \frac{1}{\sqrt{2 \pi \Sigma}} \exp \left(-\frac{\left(x-\mu\right)^2}{2 \Sigma}\right)$$

其对各参数的偏导为

$$\frac{\partial}{\partial \mu}N(x; \mu, \Sigma) = N(\mu, \Sigma)\frac{(x-\mu)}{\Sigma}$$

$$\frac{\partial}{\partial \Sigma}N(x ;\mu, \Sigma) = N(\mu, \Sigma) \Sigma^{2} \frac{\left((x-\mu)^{2}-\Sigma\right)}{2} $$

由于 $P\left(x^{(i)} | z^{(i)}=j\right) \sim \mathcal{N}\left(\mu_j, \Sigma_j\right)$，我们的似然函数可以写成

$$\ell(\phi, \mu, \Sigma) = \sum_{i=1}^n \log \sum_{j=1}^k N(x^{(i)}; \mu_{j}, \Sigma_{j}) \phi_j$$

我们先对参数 $\mu_{j}$ 做极大似然估计

$$\frac{\partial}{\partial \mu_{j}}\ell(\phi, \mu, \Sigma) 
= \sum_{i=1}^{n}\frac{N(x^{(i)}; \mu_{j}, \Sigma_{j}) \phi_j}{\sum_{j=1}^{k}N(x^{(i)}; \mu_{j}, \Sigma_{j}) \phi_j} \frac{(x^{(i)}- \mu_{j})}{\Sigma} = 0$$

这个方程是没有解析解的，似乎到这里已经是死路一条了，但是仔细观察一下这个式子，我们发现前面那坨东西长得和贝叶斯公式一模一样，事实上，它就是 $z^{(i)}$ 的先验概率

$$\begin{aligned}P\left(z^{(i)}=j | x^{(i)} \right)
&=\frac{P\left(x^{(i)} | z^{(i)}=j \right) P\left(z^{(i)}=j \right)}{P(x^{(i)})}\\
&= \frac{N\left(x^{(i)} ; \mu_j, \Sigma_j\right) \phi_j}{\sum_{j=1}^k N\left(x^{(i)} ; \mu_j, \Sigma_j\right) \phi_j} \\
\end{aligned}$$

假如我们已知数据集的标签 $z^{(i)}$ 的话，这个东西就是

$$P\left(z^{(i)}=j | x^{(i)}\right) = I\left\{z^{(i)}=j\right\}$$

代回去得到

$$\mu_j=\frac{\sum_{i=1}^n I\left\{z^{(i)}=j\right\} x^{(i)}}{\sum_{i=1}^n I\left\{z^{(i)}=j\right\}}$$

用同样的方法可以得到

$$\Sigma_j =\frac{\sum_{i=1}^n I\left\{z^{(i)}=j\right\}\left(x^{(i)}-\mu_j\right)\left(x^{(i)}-\mu_j\right)^T}{\sum_{i=1}^n I\left\{z^{(i)}=j\right\}}$$

在对 $\phi_{j}$ 做极大似然估计时，需要注意有约束条件 $\sum_{j=1}^k \phi_j=1$，因此取 $\phi_{k} = 1 - \sum_{j=1}^{k-1} \phi_j$ 得到

$$\begin{aligned}\frac{\partial}{\partial \phi_{j}}\ell(\phi, \mu, \Sigma) 
&= \sum_{i=1}^{n}\frac{N(x^{(i)}; \mu_{j}, \Sigma_{j}) - N(x^{(i)}; \mu_{k}, \Sigma_{k}) }{\sum_{j=1}^{k}N(x^{(i)}; \mu_{j}, \Sigma_{j}) \phi_j} \\
&= \sum_{i=1}^{n} \frac{I\left\{z^{(i)}=j\right\}}{\phi_{j}} - \frac{I\left\{z^{(i)}=k\right\}}{\phi_{k}} = 0
\end{aligned}$$

得到 

$$\frac{\phi_{j}}{\phi_{k}} = \frac{\sum_{i=1}^{n}I\left\{z^{(i)}=j\right\}}{\sum_{i=1}^{n}I\left\{z^{(i)}=k\right\}}$$

再将 $\phi_{k}$ 回代得到

$$\phi_j  =\frac{1}{n} \sum_{i=1}^n I\left\{z^{(i)}=j\right\}$$

以上的推导建立在已知 $z^{(i)}$ 的假设之下，事实上，我们在讲高斯判别分析的时候，也推导过类似的东西，而那个时候是监督学习，各标签 $z^{(i)}$ 的值是已知的，而现在是无监督学习，$z^{(i)}$ 是不可观测的东西，这可怎么办呢？

在我们的推导过程中，我们发现

- 如果已知各参数 $\mu,\Sigma,\phi$ 的值，可以根据贝叶斯公式求出 $I\left\{z^{(i)}=j\right\}$
- 如果已知标签 $z^{(i)}$ 的值，可以根据极大似然估计求出 $\mu,\Sigma,\phi$ 的值

据此，我们有一种基于迭代的方法。

> **Method 5. Expectation Maximization(期望最大化算法).** *EM* 算法分为两步，首先在 *E-step* 中，尝试猜测 $z^{(i)}$ 的值，然后在 *M-step* 中使用猜测值做参数估计，算法流程如下：
> 
> 1. 初始化参数 $\phi, \mu, \Sigma$ 的值
> 2. 对于每一组 $i,j$，设
> $$w_j^{(i)}=P\left(z^{(i)}=j | x^{(i)} ; \phi, \mu, \Sigma\right) = \frac{N\left(x^{(i)} ; \mu_j, \Sigma_j\right) \phi_j}{\sum_{j=1}^k N\left(x^{(i)} ; \mu_j, \Sigma_j\right) \phi_j}$$
> 3. 更新参数
> $$\begin{aligned}
\phi_j & =\frac{1}{n} \sum_{i=1}^n w_j^{(i)} \\
\mu_j & =\frac{\sum_{i=1}^n w_j^{(i)} x^{(i)}}{\sum_{i=1}^n w_j^{(i)}} \\
\Sigma_j & =\frac{\sum_{i=1}^n w_j^{(i)}\left(x^{(i)}-\mu_j\right)\left(x^{(i)}-\mu_j\right)^T}{\sum_{i=1}^n w_j^{(i)}}
\end{aligned}$$
> 4. 重复执行 2-3 直至算法收敛

仔细体会一下这个过程，我们发现它和 *k-means* 聚类算法有异曲同工之妙。

事实上，我们这里介绍的算法只是高斯混合模型下的一个例子，接下来我们将介绍更加广义的 *EM* 算法。

在此之前，我们先来讲一下 *Jensen’s inequality(琴生不等式)*，在之后的推导中我们会用到它。

---

## *3. Jensen’s Inequality(琴生不等式)*

> **Theorem 6. Jensen’s Inequality(琴生不等式).** 设 $f$ 为 *convex function(凸函数)*，即 $f^{\prime\prime}(x) \geq 0$，则对于随机变量 $X$ 有
> $$\mathbb{E}[f(X)] \geq f(\mathbb{E} X)$$ 进一步的，若 $f^{\prime\prime}(x) > 0$ 严格成立，则取等条件为
> $$P(X = \mathbb{E}(X)) = 1 \quad \Leftrightarrow \quad  X \text{ is constant}$$

证明是不困难的，$f$ 是凸函数意味着对于定义域上的点 $x_1, x_2, \ldots, x_n$，有

$$f\left(\sum_{i=1}^{n}\alpha_{i} x_{i}\right) \leq \sum_{i=1}^{n}\alpha_{i} f\left(x_{i}\right), \quad \alpha_{i}\geq 0, \sum_{i=1}^{n}\alpha_{i} = 1$$

设随机变量 $X$ 的取值为 $x_1, x_2, \ldots, x_n$，令 $\alpha_{i} = P(X=x_{i})$，代入上式即可证明。

---

## *4. General EM algorithms(广义EM算法)*

在高斯混合模型中，我们假设数据集 $x$ 服从高斯分布，而不可观测的标签 $z$ 服从多项式分布。

而现在，我们要考虑更为一般的情况，即 $x,z$ 服从任意的分布。

我们有概率模型 $P(x, z ; \theta)$，其中 $x$ 为可观测的随机变量，$z$ 为不可观测的随机变量，我们的目标是极大化似然函数

$$\begin{aligned}
\ell(\theta) & =\sum_{i=1}^n \log P\left(x^{(i)} ; \theta\right) \\
& =\sum_{i=1}^n \log \sum_{z^{(i)}} P\left(x^{(i)}, z^{(i)} ; \theta\right) .
\end{aligned}$$

这是一个非凸优化问题，要解决它是非常困难的。

我们有一个非常精妙的想法，如果能找到 $\ell(\theta)$ 的一个下界，就可以通过极大化这个下界来估计参数 $\theta$ 的值，而新的 $\theta$ 值又可以用于计算新的下界。

我们设 $Q(z)$ 是随机变量 $z$ 上的一个概率分布，即

$$\sum_z Q(z)=1, \quad Q(z) \geq 0$$

我们引入 $Q(z)$ 得到

$$\begin{aligned}\ell(\theta) 
&= \sum_{i=1}^n\log \sum_{z^{(i)}} Q(z^{(i)}) \frac{P(x^{(i)}, z^{(i)} ; \theta)}{Q(z^{(i)})} \\
&= \sum_{i=1}^n \log \mathbb{E}_{z^{(i)} \sim Q}\left[\frac{P(x^{(i)}, z^{(i)} ; \theta)}{Q(z^{(i)})}\right]
\end{aligned}$$

显然对数函数 $\log(x)$ 是凸函数，根据琴生不等式有

$$\begin{aligned}\ell(\theta) 
&\geq \sum_{i=1}^n \mathbb{E}_{z^{(i)} \sim Q}\left[\log\frac{P\left(x^{(i)}, z^{(i)} ; \theta\right)}{Q\left(z^{(i)}\right)}\right]\\
&= \sum_{i=1}^n \sum_{z^{(i)}} Q\left(z^{(i)}\right)\log\frac{P\left(x^{(i)}, z^{(i)} ; \theta\right)}{Q\left(z^{(i)}\right)}
\end{aligned}$$

我们需要选择分布 $Q$ 使得这个下界尽可能的紧，也就是等号成立，回顾琴生不等式的取等条件，需要

$$Q(z) \propto P(x, z ; \theta)$$

同时由于 $\sum_z Q(z)=1$ 的限制，有

$$\begin{aligned}
Q(z) & =\frac{P(x, z ; \theta)}{\sum_z P(x, z ; \theta)} =P(z | x ; \theta)
\end{aligned}$$

> **Method 7. Expectation Maximization(期望最大化算法).** 在数据集 $\left\{x^{(1)}, \ldots, x^{(n)}\right\}$ 上有概率分布 $P(x,z; \theta)$，其中 $z$ 是不可观测的随机变量，我们用 *EM* 算法来估计参数 $\theta$ 的流程如下：
> 
> 1. 初始化参数 $\theta$ 的值
> 2. 对于 $i = 1, 2,\ldots,n$，设
> $$Q_i\left(z^{(i)}\right)=P\left(z^{(i)} | x^{(i)} ; \theta\right)$$
> 3. 更新参数
> $$\theta =\arg \max _\theta \sum_i \sum_{z^{(i)}} Q_i\left(z^{(i)}\right) \log \frac{P\left(x^{(i)}, z^{(i)} ; \theta\right)}{Q_i\left(z^{(i)}\right)}$$
> 4. 重复执行 2-3 直至算法收敛

事实上，如果我们设

$$J(\theta, Q) = \sum_i \sum_{z^{(i)}} Q_i\left(z^{(i)}\right) \log \frac{P\left(x^{(i)}, z^{(i)} ; \theta\right)}{Q_i\left(z^{(i)}\right)}$$

我们发现 *EM* 算法实质上是对 $J(\theta, Q)$ 做坐标梯度上升的过程，因此是能够收敛的。

现在我们以广义 *EM* 算法的视角，回过头来看混合高斯模型，还记得在 *E-Step* 中，我们计算了

$$Q_i\left(z^{(i)}\right)=P\left(z^{(i)}=j | x^{(i)} ; \phi, \mu, \Sigma\right)=\frac{N\left(x^{(i)} ; \mu_j, \Sigma_j\right) \phi_j}{\sum_{j=1}^k N\left(x^{(i)} ; \mu_j, \Sigma_j\right) \phi_j}$$

当时我们是通过奇妙的观察法得到这个式子的，而在完成广义 *EM* 算法的推导之后，我们很自然的知道这个东西就是 $Q(z)$.

---

## *5. Example: Naive Bayes Model(朴素贝叶斯模型的例子)*

> **Problem 8.** 给定邮件文本数据集 $\left\{x^{(1)}, \ldots, x^{(n)}\right\}$，其中 $x^{(i)} \in \{0, 1\}^{D}$ 表示字典中每个单词 $x^{(i)}_{j}$ 是否在文本中出现过，对应的标签 $z^{(i)} \in \{0, 1\}$ 表示是否为垃圾邮件，其满足参数为
> $$\phi_z=\mathbb{P}(z=1)$$ 的伯努利分布，设 $x_{j}$ 之间相互独立且均服从伯努利分布，参数分别为
> $$\begin{aligned}
& \phi_{j | z=0}=\mathbb{P}\left(x_j=1 | z=0\right) \\
& \phi_{j | z=1}=\mathbb{P}\left(x_j=1 | z=1\right)
\end{aligned}$$

根据 *EM* 算法的流程，我们在 *E-Step* 时计算

$$\begin{aligned}
w^{(i)}& = Q(z^{(i)} = 1) =P\left(z^{(i)} = 1 | x^{(i)} ; \phi \right) \\
1 - w^{(i)}&= Q(z^{(i)} = 0) =P\left(z^{(i)} = 0 | x^{(i)} ; \phi \right)
\end{aligned}$$

在 *M-Step* 中，由于 $x^{(i)}$ 的各个分量 $x^{(i)}_{j}$ 之间相互独立，因此

$$P\left(x^{(i)}, z^{(i)} ; \phi\right) = P\left(z^{(i)} ; \phi\right) \prod_{j=1}^{D} P\left(x_{j}^{(i)}| z^{(i)} ; \phi\right)$$

所以我们的对数似然函数

$$\begin{aligned}
\ell(\phi) 
&= \sum_{i=1}^n \sum_{z^{(i)} \in \{0, 1\}} Q\left(z^{(i)}\right) \log \frac{P\left(x^{(i)}, z^{(i)} ; \phi\right)}{Q\left(z^{(i)}\right)} \\
&= \sum_{i=1}^n \sum_{z^{(i)} \in \{0, 1\}} Q\left(z^{(i)}\right) \left\{\log P\left(z^{(i)} ; \phi\right) + \sum_{j=1}^{D}\log P\left(x_j^{(i)} | z^{(i)} ; \phi\right) - \log Q\left(z^{(i)}\right)\right\}
\end{aligned}$$

先对 $\phi_{z}$ 做极大似然估计，它只与 $\log P\left(z^{(i)} ; \phi\right)$ 有关，因此

$$\begin{aligned}
\nabla_{\phi_{z}} \ell(\phi) 
&= \sum_{i=1}^n \sum_{z^{(i)} \in\{0,1\}} Q\left(z^{(i)}\right) \nabla_{\phi_{z}} \left\{ z^{(i)}\log{\phi_{z}} + (1-z^{(i)})\log{(1-\phi_{z})} \right\} \\
&= \sum_{i=1}^n \sum_{z^{(i)} \in\{0,1\}} Q\left(z^{(i)}\right) \left\{ \frac{ z^{(i)}}{\phi_{z}} -  \frac{(1-z^{(i)})}{(1-\phi_{z})} \right\} \\
&= \sum_{i=1}^n \left\{ \frac{ w^{(i)}}{\phi_{z}} -  \frac{(1-w^{(i)})}{(1-\phi_{z})} \right\} = 0
\end{aligned}$$

得到

$$\phi_{z} = \frac{1}{n}\sum_{i=1}^{n}w^{(i)}$$

同样的可以得到

$$\phi_{j | z=0} = \frac{\sum_{i=1}^{n} (1-w^{(i)}) \sum_{j=1}^{D}x_{j}^{(i)}}{D\sum_{i=1}^{n} (1-w^{(i)})}$$

$$\phi_{j | z=1} = \frac{\sum_{i=1}^{n} w^{(i)} \sum_{j=1}^{D}x_{j}^{(i)}}{D\sum_{i=1}^{n} w^{(i)}}$$

---

## Reference

- https://stephens999.github.io/fiveMinuteStats/intro_to_em.html
- https://gregorygundersen.com/blog/2019/11/10/em/
- https://gregorygundersen.com/blog/2021/04/16/variational-inference/
