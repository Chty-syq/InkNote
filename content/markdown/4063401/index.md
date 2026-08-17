---
type: markdown
title: CS229 Note(2) 生成学习算法
slug: "4063401"
order: 31
date: 2021-11-11
updatedAt: 2026-07-10 21:13:02
tags:
  - 机器学习
  - CS229
published: true
category: machine-learning
---

## *1. Generative Learning algorithms(生成学习算法)*

回想我们之前的模型，不论是线性回归，还是逻辑回归，都是对 $\mathbb{P}(y|x)$ 建模，然后通过极大似然估计得到参数 $\theta$ 的训练方法。

也就是说，我们是根据输入 $x$ 对输出 $y$ 进行建模，最终得到的是一个预测函数 $h_{\theta}$，这个函数可以直接预测新样本的分类，这样的算法称之为 *discriminative learning algorithm(判别学习算法)*.

考虑另外一种思路，现在我们要对猫狗进行二分类，我们首先对猫建立一个模型，然后对狗建立一个模型，然后将新的样本分别带入两个模型，表现更好的就是答案。

这就是 *generative learning algorithm(生成学习算法)* 的思路，也就是说要对 $\mathbb{P}(x|y)$ 建模，其中猫和狗的分布模型分别是

$$\mathbb{P}(x|y=0),\quad \mathbb{P}(x|y=1)$$

在对 $\mathbb{P}(x|y)$ 和 $\mathbb{P}(y)$ 建模完成后，我们根据贝叶斯公式就能得到 $\mathbb{P}(y|x)$ 的分布

$$\mathbb{P}(y \mid x)=\frac{\mathbb{P}(x \mid y) \mathbb{P}(y)}{\mathbb{P}(x)}$$

而我们的目标就是

$$\begin{aligned}
\arg \max _{y} \mathbb{P}(y \mid x) &=\arg \max _{y} \frac{\mathbb{P}(x \mid y) \mathbb{P}(y)}{\mathbb{P}(x)} \\
&=\arg \max _{y} \mathbb{P}(x \mid y) \mathbb{P}(y) \\
&=\arg \max _{y} \mathbb{P}(x, y)
\end{aligned}$$

## *2. Gaussion discriminant analysis(高斯判别分析)*

接下来我们学习一个生成学习算法，叫做高斯判别分析，简写为 GDA，我们用二分类问题作为例子。

> **Problem 1.** 给定一组样本 $(x^{(i)}, y^{(i)})$，对于输入 $x\in \mathbb{R}^{d}$，预测输出 $y \in \{0, 1\}$ 的值。

高斯判别分析假设 $\mathbb{P}(x|y)$ 服从多元正太分布，$\mathbb{P}(y)$ 服从伯努利分布，那么我们的模型就是

$$\begin{aligned}
y & \sim \operatorname{Bernoulli}(\phi) \\
x \mid y=0 & \sim \mathcal{N}\left(\mu_{0}, \Sigma\right) \\
x \mid y=1 & \sim \mathcal{N}\left(\mu_{1}, \Sigma\right)
\end{aligned}$$

对应的概率密度函数为

$$\begin{aligned}
\mathbb{P}(y) &=\phi^{y}(1-\phi)^{1-y} \\
\mathbb{P}(x \mid y=0) &=\frac{1}{(2 \pi)^{d / 2}|\Sigma|^{1 / 2}} \exp \left(-\frac{1}{2}\left(x-\mu_{0}\right)^{T} \Sigma^{-1}\left(x-\mu_{0}\right)\right) \\
\mathbb{P}(x \mid y=1) &=\frac{1}{(2 \pi)^{d / 2}|\Sigma|^{1 / 2}} \exp \left(-\frac{1}{2}\left(x-\mu_{1}\right)^{T} \Sigma^{-1}\left(x-\mu_{1}\right)\right)
\end{aligned}$$

其中后面两个可以整合在一起

$$\mathbb{P}(x\mid y) = \mathbb{P}(x \mid y=0) ^{1-y}\mathbb{P}(x \mid y=1)^{y}$$

我们的参数就是 $\phi, \mu_{0},\mu_{1}, \Sigma$，在样本 $x^{(i)},y^{(i)}$ 下的对数似然函数为

$$\begin{aligned}
\ell\left(\phi, \mu_{0}, \mu_{1}, \Sigma\right) 
&= \log \prod_{i=1}^{n} \mathbb{P}\left(x^{(i)}, y^{(i)}\right) \\
&= \log \prod_{i=1}^{n} \mathbb{P}\left(x^{(i)} \mid y^{(i)}\right) \mathbb{P}\left(y^{(i)}\right) \\
&= \sum_{i=1}^{n} \left((1-y^{(i)})\log\mathbb{P}(x^{(i)}|y^{(i)}=0) + y^{(i)} \log\mathbb{P}(x^{(i)}|y^{(i)}=1) + y^{(i)}\log\phi + (1-y^{(i)})\log(1-\phi) \right)
\end{aligned}$$

接下来我们需要对模型中的参数做极大似然估计，在推导过程中我们需要矩阵微分学的相关知识，建议阅读 [Matrix Calculus](/post/chty_syq/Matrix-Calculus)。

为了计算方便，我们设 $A = \{i\mid y^{(i)} = 0\}, B = \{i\mid y^{(i)} = 1\}$ 分别表示分类结果为 $0, 1$ 的集合。

首先是 $\phi$，可以看出前面两项与 $\phi$ 无关，因此

$$\begin{aligned} \frac{\partial \ell}{\partial \phi} 
&= \sum_{i=1}^{n} \frac{\partial}{\partial \phi} \left(y^{(i)}\log\phi\right) + \sum_{i=1}^{n}\frac{\partial}{\partial \phi} \left( (1 - y^{(i)})\log(1-\phi) \right) \\
&=  \frac{\sum_{i=1}^{n}(y^{(i)}-\phi)}{\phi(1-\phi)}
\end{aligned}$$

令 $ \frac{\partial \ell}{\partial \phi} = 0$ 得到

$$\phi = \frac{\sum_{i=1}^{n}y^{(i)}}{n} = \frac{|B|}{n}$$

接下来是 $\mu_{0}$，可以看出 $\mu_{0}$ 仅与第一项有关，因此

$$\begin{aligned}\frac{\partial\ell}{\partial\mu_{0}} 
&= \sum_{i=1}^{n} (1-y^{(i)}) \frac{\partial}{\partial \mu_{0}} \left(-\frac{1}{2}(x-\mu_{0})^{T}\Sigma^{-1}(x-\mu_{0}) \right) \\
&= \sum_{i=1}^{n} (1-y^{(i)}) \left( \Sigma^{-1}(x-\mu_{0}) \right) = \sum_{i\in A} \left(x-\mu_{0} \right)
\end{aligned}$$

令 $\frac{\partial\ell}{\partial\mu_{0}} = 0$，结合对称性得到

$$\mu_{0} = \frac{\sum_{i\in A} x^{(i)}}{|A|},\quad \mu_{1} = \frac{\sum_{i\in B} x^{(i)}}{|B|}$$

最后是 $\Sigma$，可以看出 $\Sigma$ 仅与前两项有关，且前两项是对称的，考虑

$$\begin{aligned}\frac{\partial}{\partial\Sigma} \log\mathbb{P}(x^{(i)}\mid y^{(i)}=0)
&= -\frac{1}{2}\frac{\partial}{\partial\Sigma} \left( \log{|\Sigma|} + (x-\mu_{0})^{T}\Sigma^{-1}(x-\mu_{0}) \right) \\
&= -\frac{1}{2}\left( \Sigma^{-1} -\Sigma^{-1} (x-\mu_{0})(x-\mu_{0})^{T}\Sigma^{-1} \right)
\end{aligned}$$

因此根据对称性有

$$\begin{aligned}\frac{\partial \ell}{\partial \Sigma} 
&= -\frac{1}{2}\sum_{i=1}^{n}\{ (1-y^{(i)})\left( \Sigma^{-1} - \Sigma^{-1} (x-\mu_{0})(x-\mu_{0})^{T}\Sigma^{-1} \right) + y^{(i)} \left( \Sigma^{-1} - \Sigma^{-1} (x-\mu_{1})(x-\mu_{1})^{T}-\Sigma^{-1} \right) \} \\
&= -\frac{1}{2}\sum_{i=1}^{n} \left( \Sigma^{-1} - \Sigma^{-1} (x-\mu_{y^{(i)}})(x-\mu_{y^{(i)}})^{T}\Sigma^{-1} \right)
\end{aligned}$$

令 $\frac{\partial \ell}{\partial \Sigma} = 0$ 得到

$$\Sigma = \frac{1}{n} \sum_{i=1}^{n}(x-\mu_{y^{(i)}})(x-\mu_{y^{(i)}})^{T}$$

现在我们得到了所有的参数 $\phi, \mu_{0}, \mu_{1}, \Sigma$，得到了 $\mathbb{P}(x|y), \mathbb{P}(y)$ 的分布，根据贝叶斯公式就可以计算 $\mathbb{P}(y|x)$ 进行预测了。


## *3. Naive Bayes(朴素贝叶斯)*

在 GDA 中，我们的输入 $x$ 是一个连续实值向量，现在我们来看一个离散的情况。

> **Problem 2.** 垃圾邮件分类器需要对输入的文本判断是否属于垃圾邮件，这个问题可以这样建模，我们取一个字典 $D$，且 $|D| = 50000$，对于输入文本，我们把它处理成如下的向量
> $$x=\left[\begin{array}{c}
1 \\
0 \\
0 \\
\vdots \\
1 \\
\vdots \\
0
\end{array}\right] \quad \begin{aligned}
&\text { a } \\
&\text { aardvark } \\
&\text { aardwolf } \\
&\vdots \\
&\text { buy } \\
&\vdots \\
&\text { zygmurgy }
\end{aligned}$$
> 其中 $x_{j}$ 表示字典中的第 $j$ 个单词 $D_{j}$ 是否在文本中出现过，我们需要对输出 $y \in [0,1]$ 做预测。

如果沿用高斯判别分析的方法来做的话，我们的输入向量 $x$ 服从多项式分布，对应的参数数量是 $2^{|D|}$，这个量级是无法接受的。

现在我们做一个更强的假设，$x$ 的各个分量间是相互独立的，这样的话就有

$$\mathbb{P}(x_{1},x_{2},\cdots,x_{|D|} \mid y) = \prod_{j=1}^{|D|} \mathbb{P}(x_{j} \mid y)$$

其中每个 $x_{j}$ 都是服从伯努利分布的，因此参数个数为 $2|D|+1$，分别为

$$\phi_{j|y=0} = \mathbb{P}(x_{j}=1\mid y=0)$$

$$\phi_{j|y=1} = \mathbb{P}(x_{j}=1\mid y=1)$$

$$\phi_{y} = \mathbb{P}(y = 1)$$

我们的对数似然函数就是

$$\begin{aligned}\ell(\phi) 
&= \log \prod_{i=1}^{n} \mathbb{P}(x^{(i)},y^{(i)}) = \log \prod_{i=1}^{n} \mathbb{P}(x^{(i)}\mid y^{(i)}) \mathbb{P}(y^{(i)})\\
&= \log \prod_{i=1}^{n} \mathbb{P}(y^{(i)})\prod_{k=1}^{|D|} \mathbb{P}(x^{(i)}_{k} \mid y^{(i)}) \\
&= \sum_{i=1}^{n} \log \mathbb{P}(y^{(i)}) + \sum_{i=1}^{n}\sum_{k=1}^{|D|} \log \mathbb{P}(x^{(i)}_{k} \mid y^{(i)}) \\
\end{aligned}$$

先对 $\phi_{y}$ 做极大似然估计，显然它仅与 $\mathbb{P}(y^{(i)})$ 有关

$$\begin{aligned}\frac{\partial \ell}{\partial \phi_{y}}
&= \frac{\partial}{\partial \phi_{y}} \sum_{i=1}^{n}\log\mathbb{P}(y^{(i)}) \\
&= \frac{\partial}{\partial \phi_{y}} \sum_{i=1}^{n}\log \phi_{y}^{y_{(i)}} (1-\phi_{y})^{1-y^{(i)}} \\
&= \frac{\partial}{\partial \phi_{y}} \sum_{i=1}^{n}\left( y^{(i)}\log \phi_{y} + (1-y^{(i)}) \log(1-\phi_{y}) \right)\\
&= \sum_{i=1}^{n} \frac{y^{(i)}-\phi_{y}}{\phi_{y}(1-\phi_{y})}
\end{aligned}$$

令 $\frac{\partial \ell}{\partial \phi_{y}} = 0$ 得到

$$\phi_{y} = \frac{1}{n}\sum_{i=1}^{n}y^{(i)}$$

接下来是 $\phi_{j|y=1}$，显然它仅与 $\mathbb{P}(x_{j}^{(i)}\mid y^{(i)})$ 有关

$$\begin{aligned} \frac{\partial \ell}{\partial \phi_{j|y=1}}
&= \frac{\partial}{\partial \phi_{j|y=1}} \sum_{i=1}^{n} \log\mathbb{P}(x_{j}^{(i)}|y^{(i)}) \\
&= \frac{\partial}{\partial \phi_{j|y=1}} \sum_{i=1}^{n}y^{(i)} \left( x_{j}^{(i)} \log{\phi_{j|y=1}} + (1-x_{j}^{(i)}) \log(1-\phi_{j|y=1}) \right) \\
&= \sum_{i=1}^{n} y^{(i)} \cdot\frac{x^{(i)}_{j}-\phi_{j|y=1}}{\phi_{j|y=1}(1-\phi_{j|y=1})}
\end{aligned}$$

令 $ \frac{\partial \ell}{\partial \phi_{j|y=1}}=0$ 得到

$$\phi_{j|y=1} = \frac{\sum_{i=1}^{n}y^{(i)}x^{(i)}_{j}}{\sum_{i=1}^{n}y^{(i)}}$$

根据对称性可以得到

$$\phi_{j|y=0} = \frac{\sum_{i=1}^{n}(1-y^{(i)})x^{(i)}_{j}}{\sum_{i=1}^{n}(1-y^{(i)})}$$

### *3.1 Laplace Smoothing(拉普拉斯平滑)*

现在我们得到了各个参数的极大似然估计值，问题已经解决了，然而存在一个零概率的问题。

例如，某位教授发送了一封探讨 “neurips” 的邮件，然而此前的训练样本中从未出现过这个单词，假设这个单词出现在词典的 $35000$ 位置，那么参数

$$\phi_{35000|y=1} = 0, \quad \phi_{35000|y=0}=0$$

这是因为我们的 $x_{35000}^{(i)}$ 恒等于 $0$，极大似然估计的结果就是 $0$，因此

$$\begin{aligned}\mathbb{P}(y=1\mid x) 
&= \frac{\prod_{j=1}^{|D|}\mathbb{P}(x_{j}\mid y=1)\mathbb{P}(y=1)}{\prod_{j=1}^{|D|}\mathbb{P}(x_{j}\mid y=1)\mathbb{P}(y=1)+\prod_{j=1}^{|D|}\mathbb{P}(x_{j}\mid y=0)\mathbb{P}(y=0)} = \frac{0}{0}
\end{aligned}$$

事实上，在统计意义下认为

$$\mathbb{P}(x_{35000}|y=1) = 0$$

是不合理的，不能因为之前没有见过这个单词就认为它出现的概率是 $0$.

为了解决这个问题，我们在做极大似然估计时，给分子分母都加上一个数作为修正

$$\phi_{j|y=1} = \frac{1 + \sum_{i=1}^{n}y^{(i)}x^{(i)}_{j}}{2 + \sum_{i=1}^{n}y^{(i)}}$$

$$\phi_{j|y=0} = \frac{1 + \sum_{i=1}^{n}(1-y^{(i)})x^{(i)}_{j}}{2 + \sum_{i=1}^{n}(1-y^{(i)})}$$

这种方法就是 *Laplace smoothing(拉普拉斯平滑)*.

### *3.2 Event models for text classification(文本分类的事件模型)*

在之前的讨论中，我们的输入向量 $x$ 表示词典中的单词是否出现过，每个分量 $x_{j}$ 服从伯努利分布且相互独立，这样的模型我们称之为 *Bernoulli event model(伯努利事件模型)*.

现在我们来考虑一种更强的建模，设邮件的长度为 $d$，令 $x_{j}$ 表示邮件中的第 $j$ 个词在词典中的索引，例如邮件中的第 $100$ 个单词是 *pixiv*，而 $D_{9} = \text{pixiv}$，则 $x_{100} = 9$.

可以看出输入向量 $x$ 的长度为 $d$，且 $x_{j} \in [1,|D|]$ 服从多项式分布且相互独立，这样建模考虑到了每个词在邮件中的出现次数，因此是更强力的模型，我们称之为 *Multinomial event model(多项式事件模型)*.

模型的参数有

$$\phi_{k|y=1} = \mathbb{P}(x_{j}=k|y=1)\quad \text{for any } j$$

$$\phi_{k|y=0} = \mathbb{P}(x_{j}=k|y=0)\quad \text{for any } j$$

$$\phi_{y} = \mathbb{P} (y)$$

对于训练集 $(x^{(i)},y^{(i)}), i\in [1,n]$，$d_{i}$ 表示第 $i$ 封邮件的长度，我们的对数似然函数为

$$\begin{aligned}\ell(\phi) 
&= \log \prod_{i=1}^{n}\mathbb{P}(x^{(i)},y^{(i)})\\
&= \log \prod_{i=1}^{n} \mathbb{P}(y^{(i)}) \prod_{j=1}^{d_{i}} \mathbb{P} (x_{j}^{(i)}\mid y^{(i)}) \\
\end{aligned}$$

对各个参数做极大似然估计得到

$$\phi_{y} = \frac{\sum_{i=1}^{n}y^{(i)}}{n}$$

$$\phi_{k|y=1} = \frac{\sum_{i=1}^{n}\sum_{j=1}^{d_{i}}y^{(i)} I(x_{j}^{(i)}=k)}{\sum_{i=1}^{n}y^{(i)}d_{i}}$$

$$\phi_{k|y=0} = \frac{\sum_{i=1}^{n}\sum_{j=1}^{d_{i}}(1-y^{(i)}) I(x_{j}^{(i)}=k)}{\sum_{i=1}^{n}(1-y^{(i)})d_{i}}$$

应用拉普拉斯平滑后得到

$$\phi_{k|y=1} = \frac{1 + \sum_{i=1}^{n}\sum_{j=1}^{d_{i}}y^{(i)} I(x_{j}^{(i)}=k)}{|D| + \sum_{i=1}^{n}y^{(i)}d_{i}}$$

$$\phi_{k|y=0} = \frac{1 + \sum_{i=1}^{n}\sum_{j=1}^{d_{i}}(1-y^{(i)}) I(x_{j}^{(i)}=k)}{|D| + \sum_{i=1}^{n}(1-y^{(i)})d_{i}}$$


## *4. Lecture Links*

- Vedio: https://www.bilibili.com/video/BV18E411Z7RS?p=5
- Notes: http://cs229.stanford.edu/notes2021fall/cs229-notes2.pdf
