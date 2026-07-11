---
type: markdown
title: CS229 Note(6) 正则化
slug: "8831954"
order: 26
date: 2023-04-04
updatedAt: 2026-07-10 21:11:20
tags:
  - 机器学习
  - CS229
published: true
category: machine-learning
---

之前我们讲到在偏差与方差之间存在一个平衡点，偏差过高，则有欠拟合，方差过高，则会引发过拟合。

在本章节中，我们将介绍几种防止过拟合的方法。

---

## *1. Model Selection(模型选择)*

在上一章节中，我们讲到模型的复杂程度会影响训练的偏差与方差，例如对于一个符合二次曲线的输入特征

- 如果使用线性模型拟合，则会有较高的偏差，模型的表达能力不足，引发欠拟合。
- 如果使用三次曲线拟合，模型虽然在训练集上表现优秀，但在测试集上则会有较高的方差，引发过拟合。

对于一个具体的输入特征样本集合 $S$，我们应当如何选择我们的训练模型，本节我们将解决这个问题。

假设我们有一个可供选择的训练模型的集合

$$\mathcal{M}=\left\{M_1, \ldots, M_d\right\}$$

例如，$M_{1}$ 可以是线性模型，$M_{2}$ 可以是二次曲线模型。首先，我们有一个非常自然的想法，就是分别使用这些模型在训练集上完成训练，然后在验证集上进行验证，从中选取表现最好的模型。

> **Method 1. Hold-out Cross Validation(保留交叉验证).** 将数据集 $S$ 随机划分为训练集 $S_{\text{train}}$ 与验证集 $S_{\text{cv}}$，我们一般选择
> $$S = S_{\text{train}}(70\%) + S_{\text{cv}}(30\%)$$ 将 $\mathcal{M}$ 中的模型分别在 $S_{\text{train}}$ 上训练分别得到最优的预测函数 $h_{i}$，并使用 $h_{i}$ 在 $S_{\text{cv}}$ 上进行验证，选取验证误差最小的作为最优模型
> $$M^{*} = \min_{M_{i}} \hat{\varepsilon}_{S_{\mathrm{cv}}}\left(h_i\right)$$

但是有的时候，获取样本数据的代价是非常高的，例如在医学上，每个样本都可能代表着一个病人痛苦的经历，而我们为了模型选择而丢弃掉了 $30\%$ 的样本。

我们有一种交叉验证的变种方法可以更高效的利用数据。

> **Method 2. k-fold Cross Validation(折叠交叉验证).** 将数据集 $S$ 随机划分为 $k$ 个子集 $S_{1},\ldots,S_{k}$，每个子集的大小为 $\frac{S}{k}$，我们一般选择 $k=5$ 或 $k=10$，执行如下操作：
> 
1. 依次选择 $i=1,\ldots,k$，将 $S_{i}$ 作为验证集，剩下的部分作为训练集 $S_{\text{train}}$
2. 将 $\mathcal{M}$ 中的模型 $M_{j}$ 在 $S_{\text{train}}$ 上训练分别得到最优的预测函数 $h_{j}$
3. 使用 $h_{j}$ 在 $S_{i}$ 上进行验证，得到验证误差 $\hat{\varepsilon}_{S_{i}}\left(h_j\right)$
4. 重复执行上述步骤得到验证误差集合 $\hat{\varepsilon}_{S_{1}}\left(h_j\right), \ldots, \hat{\varepsilon}_{S_{k}}\left(h_j\right)$，取均值作为模型 $M_{j}$ 的验证误差
$$\hat{\varepsilon}(h_{j}) = \frac{1}{k}\sum_{i=1}^{k}\hat{\varepsilon}_{S_{i}}\left(h_j\right)$$
5. 取验证误差最小的模型作为最优模型
$$M^{*} = \min_{M_{j}} \hat{\varepsilon}\left(h_j\right)$$
 
可以看到折叠交叉验证对数据的利用率极高，但是所需的计算量极大。

在折叠交叉验证中，我们取 $k=|S|$ 得到 *leave-one-out cross validation(留一交叉验证)*，也就是说每次仅取一个样本作为验证集，如果训练样本非常少，可以采用这种方法。

---

## *2. Feature Selection(特征选择)*

对于许多机器学习问题，我们的输入特征的维度可能是非常大的，例如之前提到过的文本分类问题，在识别垃圾邮件时，我们使用的字典中高达 $50000$ 个单词，也就是说，输入特征的维度高达 $50000$，这很可能引发过拟合的问题。

我们发现字典中的能够用于垃圾邮件分类的单词其实是不多的，例如 "buy", "viagra" 这样的词，而诸如 "like", "and", "the" 这样的词对于问题并没有帮助。

我们可以从原始的输入特征中提取一个与问题更相关的子集出来，作为训练特征，来降低过拟合的风险。

假设我们的输入特征有 $n$ 个，其子集的数量为 $2^{n}$，我们通常使用不同的启发式规则进行搜索。

> **Method 3. Forward Search(前向搜索).** 对于维度为 $n$ 的输入特征，使用如下方法从中选取 $k$ 个作为新的特征
> 
1. 初始化选取的特征集合 $\mathcal{F} = \varnothing$
2. 枚举尚未选取过的特征 $f_{i} \notin\mathcal{F}$，尝试将其添加到 $\mathcal{F}$ 中得到 $\mathcal{G}_{i} = \mathcal{F} \cup f_{i}$
3. 使用交叉验证的方法得到最优的特征 
$$f^{*} = \min_{f_{i}}\hat{\varepsilon}\left(\mathcal{G}_{i}\right)$$
4. 更新 $\mathcal{F} = \mathcal{F} \cup f^{*}$
5. 重复执行上述步骤直到 $|\mathcal{F}| = k$

说人话，我们从空集开始，每次选取一个最优的特征加入到集合中，直到选了 $k$ 个为止。而判断最优特征的方法则是训练模型与交叉验证。

我们也可以反过来做，从所有特征开始，每次删除一个最坏的特征，这种方法就是 *backward search(后向搜索)*.

在这种基于启发式搜索的方法中，我们每次选取特征时，都需要在特征子集上训练模型，并进行交叉验证，计算量非常巨大，我们称之为基于 *wrapped(封装)* 的方法。

利用这类方法，我们最终得到的特征子集并不能保证是最好的那个，实际上寻找最好的特征子集是 *NP-Hard* 问题。

另一类基于 *filter(过滤)* 的方法，其效果通常差一些，但是计算量大大减少。这种方法的大致思想是衡量各个特征对输出值的影响程度(相关程度)，从中选取前 $k$ 大的作为特征子集，至于如何衡量特征对输出值的影响程度，方法有很多种，例如 *KL* 散度。

---


## *3. Bayesian Regularization(贝叶斯正则化)*

在前面的章节中，我们介绍了模型选择的方法，来选择合适的模型防止过拟合，本节我们将讲述另一种防止过拟合的方法，我们通常称之为 *Regularization(正则化)*.

在最开始的时候，我们是对 $\mathbb{P}(y|x; \theta)$ 建模，通过 *maximum likelihood estimation(极大似然估计)* ，得到参数 $\theta$ 的最优值

$$\theta_{\mathrm{MLE}}=\arg \max _\theta \prod_{i=1}^n \mathbb{P}\left(y^{(i)} | x^{(i)} ; \theta\right)$$

通常取对数似然函数，则上式等价于

$$\theta_{\mathrm{MLE}}=\arg \min _\theta \sum_{i=1}^n \log\mathbb{P}\left(y^{(i)} | x^{(i)} ; \theta\right)$$

在这种方法里，我们把 $\theta$ 看成了一个常数，而不是一个随机变量，只不过我们不知道它的值是什么，我们用最大似然估计的方法来估计它的真实值，这样的方法属于 *frequency school(频率学派)* 的方法。

另一种则是 *Bayesian school(贝叶斯学派)* 的方法，贝叶斯学派的观点是，我们不知道 $\theta$ 的值，所以我们为 $\theta$ 赋予一个先验的概率分布 $\mathbb{P}(\theta)$，来表达 $\theta$ 取值的不确定性。

在开始的时候，$\theta$ 没见过任何数据，它有一个初始的概率分布 $\mathbb{P}(\theta)$，例如它可以是高斯分布。

给定训练集 $S=\left\{\left(x^{(i)}, y^{(i)}\right)\right\}_{i=1}^n$，贝叶斯学派会根据贝叶斯公式计算 $\theta$ 在 $S$ 上的后验概率

$$\begin{aligned}
\mathbb{P}(\theta | S) & =\frac{\mathbb{P}(S | \theta) \mathbb{P}(\theta)}{\mathbb{P}(S)} \\
& =\frac{\left(\prod_{i=1}^n \mathbb{P}\left(y^{(i)} | x^{(i)}, \theta\right)\right) \mathbb{P}(\theta)}{\int_\theta\left(\prod_{i=1}^n \mathbb{P}\left(y^{(i)} | x^{(i)}, \theta\right) \mathbb{P}(\theta)\right) d \theta}
\end{aligned}$$

这个概率表示 $\theta$ 在看到数据集 $S$ 之后的分布，那么当我们有测试输入 $x$ 时，我们使用

$$\mathbb{P}(y | x, S)=\int_\theta \mathbb{P}(y | x, \theta) \mathbb{P}(\theta | S) d \theta$$

$$\mathbb{E}[y | x, S]=\int_y y \mathbb{P}(y | x, S) d y$$

来预测 $x$ 对应的输出 $y$.

实际上，这两个积分的数值计算是非常困难的，因为 $\theta$ 是一个 $n+1$ 维的向量，我们要在很高维的空间内计算它。而且在通常情况下，它们并没有解析解。

所以我们通常不会计算完整的后验概率 $\mathbb{P}(\theta | S)$，而是通过 *maximum a posteriori(极大化后验值)* 来得到

$$\theta_{\mathrm{MAP}}=\arg \max _\theta \prod_{i=1}^n \mathbb{P}\left(y^{(i)} | x^{(i)}, \theta\right) \mathbb{P}(\theta)$$

通常情况下取负对数进行计算，上式等价于

$$\theta_{\mathrm{MAP}}=\arg \min _\theta \sum_{i=1}^n \left[\log\mathbb{P}\left(y^{(i)} | x^{(i)}, \theta\right) - \log\mathbb{P}(\theta)\right]$$

注意到这和极大化似然函数的形式是几乎一致的，只不过多了一项 $\theta$ 的先验 $\mathbb{P}(\theta)$，在实际情况中，我们通常选择 $\theta \sim \mathcal{N}\left(0, \tau^2 I\right)$，其中 $\tau$ 为协方差矩阵。

我们用 $\theta$ 服从高斯分布 $\mathcal{N}\left(0, \tau^2 I\right)$ 的情况做出一种比较直观的解释，在这样的分布下，我们的参数 $\theta$ 的许多分量是非常接近于 $0$ 的，而

$$h_{\theta} = g(\theta^{T}x)$$

所以实际上我们是将输入特征 $x$ 的进行了特征选择，令一些对输出结果不那么重要的特征接近于 $0$，来达到防止过拟合的目的。

我们将 $\mathbb{P}(\theta)= \frac{1}{(2\pi)^{n}|\tau|} \exp(-\frac{\theta^{T}\tau^{-2}\theta}{2})$ 代入得到

$$\theta_{\mathrm{MAP}}=\arg \min _\theta \sum_{i=1}^n \log\mathbb{P}\left(y^{(i)} | x^{(i)}, \theta\right) + \frac{n}{2}(\theta^{T}\tau^{-1})^{2} $$

这等价于在 *MLE* 方法中加入 $L_{2}$ 惩罚项 $\lambda||\theta||_{2}^{2}$.

如果假设 $\theta$ 服从拉普拉斯分布的话，可以证明它等价于在 *MLE* 方法中加入 $L_{1}$ 惩罚项 $\lambda||\theta||_{1}$.
