---
type: markdown
title: CS229 Note(1) 回归预测
slug: "5233085"
order: 32
date: 2021-10-18
updatedAt: 2026-07-10 21:23:01
tags:
  - 机器学习
  - CS229
published: true
category: machine-learning
---

<!-- more -->

## *0 写在前面的话*

郑老师是我的毕设导师，朝厚是郑老师的创业公司，彼时，我已在此实习了一周时间，日后要给郑老师干活的话，*machine learning(机器学习)* 是必修课之一。

学长建议以吴恩达老师的网课 *CS229* 作为入门，于是便有了这篇文章。

- [Lecture Videos](https://www.bilibili.com/video/BV18E411Z7RS?p=1)
- [Lecture Notes](http://cs229.stanford.edu/notes2022fall/main_notes.pdf)

这套课程非常适合有一定数学基础的同学学习，只需要掌握基础的微积分、线性代数和概统知识。

## *1 Introduction*

什么是机器学习？

> Machine learning, a field of study that gives computers the ability to learn without being explicitly programmed. —— Arthur Samuel(1959)

考虑常规的程序设计，总是程序员设计一套逻辑交给程序去执行，程序本身就像一个听话的孩子，只会做你设计好的工作。

而机器学习就是设计一种程序，这种程序可以自动处理某些任务，而不需要程序员设计执行逻辑。

## *2 Linear Regression(线性回归)*

> **Problem 1.(房价预测)** 某公司想要预测当地的房价，他们收集了 $n$ 组数据，每组数据包含了房子的面积 $x_{1}$，卧室的数量 $x_{2}$，以及对应的价格 $y$，以此作为根据给出房价的预测方法。

这是一个回归问题，我们在本节中仅考虑线性回归，即假设房价的预测函数为线性函数

$$h_{\theta}(x) = \theta_{0} + \theta_{1} x_{1} + \theta_{2} x_{2} = \sum_{k=0}^{2} \theta_{k} x_{k}$$

其中 $\vec{\theta} = \{\theta_{0}, \theta_{1}, \theta_{2}\}$ 是一组参数，我们需要找到合适的 $\vec{\theta}$ 来预测房价。那么如何判断 $\vec{\theta}$ 是合适的呢？

我们设计一个 *cost function(代价函数)*

$$J(\theta) = \frac{1}{2}\sum_{i=1}^{n}{(h_{\theta}(x^{(i)})-y^{(i)}})^{2}$$

其中 $x^{(i)}$ 表示第 $i$ 组样本数据，$y^{(i)}$ 表示对应的真实值，我们希望预测值与真实值的差距尽可能的小，也就是说，我们需要最小化 $J(\theta)$ 的值。

### *2.1 Gradient Descent(梯度下降)*

我们考虑 $J(\theta)$ 在每个 $\theta_{k}$ 方向上的变化趋势

$$\begin{aligned} \frac{\partial}{\partial \theta_{k}} J(\theta) 
&= \sum_{i=1}^{n}{(h_{\theta}(x^{(i)})-y^{(i)}})\frac{\partial (h_{\theta}(x^{(i)})-y_{(i)})}{\partial \theta_{k}} \\
&= \sum_{i=1}^{n}{(h_{\theta}(x^{(i)})-y^{(i)}}) x_{k}^{(i)}
\end{aligned}$$

我们每次向这个梯度方向走一步，最终就能求得 $J(\theta)$ 的一个局部最小值

$$\theta_{k} := \theta_{k} - \eta \sum_{i=1}^{n}(h_{\theta}(x^{(i)}) - y^{(i)}) x_{k}^{(i)}$$

由于 $J(\theta)$ 是一个二次曲面，因此我们求得的局部最优解就是全局最优解。

### 2.2 *Least Squares Method(最小二乘法)*

我们设 
$$X = \begin{bmatrix}
  (x^{(1)})^{T} \\
  (x^{(2)})^{T} \\
  \vdots \\
  (x^{(n)})^{T} 
\end{bmatrix},\quad X\vec{\theta} = \begin{bmatrix}
  (x^{(1)})^{T} \theta\\
  (x^{(2)})^{T} \theta\\
  \vdots  \\
  (x^{(n)})^{T} \theta 
\end{bmatrix} = \begin{bmatrix}
  h_{\theta}(x^{(1)})\\
  h_{\theta}(x^{(2)}) \\
  \vdots  \\
  h_{\theta}(x^{(n)})
\end{bmatrix}, \quad \vec{y} = \begin{bmatrix}
  y^{(1)} \\
  y^{(2)} \\
  \vdots  \\
  y^{(n)}
\end{bmatrix}$$

那么有

$$J(\theta) = \frac{1}{2}(X\vec{\theta} - \vec{y})^{T}(X\vec{\theta} - \vec{y})$$

我们还是要求 $J(\theta)$ 的最小值，在此之前我们先了解一些矩阵方面的运算。

设 $A\in \mathbb{R}^{m\times n}$，即一个 $m\times n $ 的矩阵，函数 $f: \mathbb{R}^{m\times n} \rightarrow \mathbb{R}$ 把矩阵映射为实数，定义 $f$ 的梯度

$$\nabla f(A) = \begin{bmatrix}
\frac{\partial f}{\partial A_{11}} & \frac{\partial f}{\partial A_{12}} & \cdots &\frac{\partial f}{\partial A_{1n}} \\
\frac{\partial f}{\partial A_{21}}  & \frac{\partial f}{\partial A_{22}} & \cdots &\frac{\partial f}{\partial A_{2n}} \\
\vdots  & \vdots &  & \vdots\\
\frac{\partial f}{\partial A_{m1}}  & \frac{\partial f}{\partial A_{m2}} & \cdots &\frac{\partial f}{\partial A_{mn}}
\end{bmatrix}$$

矩阵的迹运算就是这样的函数，对于方阵 $A\in \mathbb{R}^{n\times n}$，$A$ 的迹定义为

$$tr(A) = \sum_{k=1}^{n} A_{kk}$$

接下来我们要证明一些有关矩阵迹运算的性质。

> **Theorem 1.** 对于 $A\in \mathbb{R}^{m\times n}, B\in \mathbb{R}^{n\times m}$，有
> $$tr(AB) = tr(BA)$$

这个证明是非常简单的，只需要按照定义展开

$$tr(AB) = \sum_{k=1}^{m} (AB)_{kk} = \sum_{k=1}^{m} \sum_{i=1}^{n} A_{ki} B_{ik}$$

只需要交换求和号即可得证

> **Theorem 2.** 对于 $A\in \mathbb{R}^{m\times n}, B\in \mathbb{R}^{n\times m}$，有
> $$\nabla_{A} tr(AB) = B^{T}$$

同样把左边展开

$$\frac{\partial}{\partial A_{a,b}} tr(AB) =\frac{\partial}{\partial A_{a,b}} \sum_{k=1}^{m} \sum_{i=1}^{n} A_{ki} B_{ik} [k=a, i=b] = B_{b,a}$$

> **Theorem 3.** 对于 $A,B,C \in \mathbb{R}^{n\times n}$，有
> $$\nabla_{A} tr(ABA^{T}C) = CAB + C^{T}AB^{T}$$

这个证明有点难度，不过思路还是一样的

$$\begin{aligned} \frac{\partial}{\partial_{A_{a,b}}} tr(ABA^{T}C) 
&=  \frac{\partial}{\partial_{A_{a,b}}} \sum_{i,j,k,l=1}^{n} A_{ij}B_{jk}A_{lk}C_{li} \\
&= \sum_{i,j,k,l=1}^{n} B_{jk}C_{li} \frac{\partial}{\partial_{A_{a,b}}} (A_{ij}A_{lk}) \\
&= \sum_{i,j,k,l=1}^{n} B_{jk}C_{li}  (A_{ij} \frac{\partial A_{lk}}{\partial_{A_{a,b}}} [l=a,k=b] + \frac{\partial A_{ij}}{\partial_{A_{a,b}}} A_{lk} [i=a, j=b]) \\
&= \sum_{i,j=1}^{n} C_{ai}A_{ij}B_{jb} + \sum_{k,l=1}^{n} C_{la}A_{lk}B_{bk} \\
&= (CAB)_{ab} + (C^{T}AB^{T})_{ab}
\end{aligned}$$

推完这些公式后，我们回到最初的问题，我们希望最小化

$$J(\theta) = \frac{1}{2}(X\vec{\theta} - \vec{y})^{T}(X\vec{\theta} - \vec{y})$$

那么我们希望我们的参数 $\theta$ 使得 $J(\theta)$ 走到了全局最低点，也就是梯度为 $0$ 的点，也就是要解方程 $\nabla_{\theta} J(\theta) = 0$

$$\nabla_{\theta}J(\theta) = \frac{1}{2} \nabla_{\theta}(\theta^{T}X^{T}X\theta - y^{T} X \theta - \theta^{T} X^{T} y + y^{2})$$

首先 $y^{2}$ 项与 $\theta$ 无关，可以删掉，根据 *Theorem1* 和 *Theorem 2*

$$\nabla_{\theta} (y^{T}X\theta) = X^{T}y$$

$$\nabla_{\theta} (\theta^{T}X^{T}y) = \nabla_{\theta} (y^{T}X\theta) = X^{T}y$$

接下来处理 $\nabla_{\theta} (\theta^{T} X^{T}X\theta) = \nabla_{\theta} (\theta \theta^{T} X^{T} X)$，在 *Theorem 3* 中，取 $B$ 为单位阵得到

$$\nabla_{A} (AA^{T}C) = CA + C^{T}A$$

带入得到

$$\nabla_{\theta} (\theta \theta^{T} X^{T} X) = 2X^{T}X\theta$$

因此

$$J(\theta) = X^{T}X\theta - X^{T}y = 0$$

移项得到最小二乘法的 *normal equations(标准方程)*

$$X^{T}X\theta = X^{T}y$$

解之得到我们的参数

$$\theta = (X^{T}X)^{-1}X^{T}y$$

### 2.3 *Probabilistic interpretation(概率解释)*

在上面的方法中，我们把代价函数设计为

$$J(\theta) = \frac{1}{2}\sum_{i=1}^{n}{(h_{\theta}(x^{(i)})-y^{(i)}})^{2}$$

为什么要这样设计呢？为什么是平方而不是三次方或四次方呢？我们给出一种基于概率学的解释。

我们假设

$$y^{(i)} = \theta^{T}x^{(i)} + \epsilon^{(i)} $$

其中 $\epsilon^{(i)}$ 表示第 $i$ 个样本的误差项，它可能是由多种因素共同引发的，可以看作很多独立随机变量的和，因此根据中心极限定理，我们一般认为误差项服务高斯分布 $\mathcal{N}(0,\sigma^{2})$，即

$$\mathbb{P}(\epsilon^{(i)}) = \frac{1}{\sqrt{2\pi}\sigma}\exp(-\frac{(\epsilon^{(i)})^{2}}{2\sigma^{2}})$$

因此 $y^{(i)} \sim \mathcal{N}(\theta^{T}x^{(i)},\sigma^{2})$，即

$$\mathbb{P}(y^{(i)}|x^{(i)};\theta) = \frac{1}{\sqrt{2\pi}\sigma}\exp(-\frac{(y^{(i)}-\theta^{T}x^{(i)})^{2}}{2\sigma^{2}})$$

现在我们有样本 $\vec{x}, \vec{y}$，并且得到了 $y^{(i)}$ 在参数 $\theta$ 下的概率分布，我们希望求出合适的 $\theta$ 使得这个分布更加契合手中的样本，实际上这是一个参数估计问题。

设参数 $\theta$ 的似然函数

$$L(\theta) = \mathbb{P}(\vec{y}|\vec{x};\theta) = \prod_{i=1}^{n} \frac{1}{\sqrt{2\pi}\sigma}\exp(-\frac{(y^{(i)}-\theta^{T}x^{(i)})^{2}}{2\sigma^{2}})$$

为了计算方便，一般取对数似然函数

$$\ell(\theta) = \log{L(\theta)} = n \log{\frac{1}{\sqrt{2\pi \sigma}}} - \sum_{i=1}^{n} \frac{(y^{(i)}-\theta^{T}x^{(i)})^{2}}{2\sigma^{2}}$$

我们希望 $\ell(\theta)$ 的值尽可能的大，也就是最小化

$$\sum_{i=1}^{n} \frac{(y^{(i)}-\theta^{T}x^{(i)})^{2}}{2}$$

而这个东西刚好就是我们的代价函数 $J(\theta)$

## 3. *Logistic Regression*

相比回归问题，分类问题的 $y$ 是离散的，比如常见的二元分类，分类的结果只能是 $y\in\{0,1\}$.

线性回归在多数情况下不能很好的拟合分类问题，我们需要改变我们的预测函数

$$h_{\theta}(x) = g(\theta^{T}x) = \frac{1}{1+e^{-\theta^{T}x}}$$

其中函数 $g(z) = \frac{1}{1+e^{-z}}$ 称为 *sigmod function(逻辑函数)*，函数长这个样子

<center>![title](/content-images/external/d60a9e0136b584205c2052ef015278d9.png)</center>

这个函数有一个非常优雅的性质

$$g^{\prime} (z) = g(z)(1-g(z))$$

接下来我们的任务就是找到合适的 $\theta$ 使得预测函数契合手中的样本 $\vec{x},\vec{y}$

按照概率分析的步骤，首先要得到在参数 $\theta$ 下 $y$ 的分布

$$
\begin{aligned}
\mathbb{P}(y=1 \mid x ; \theta) &=h_{\theta}(x) \\
\mathbb{P}(y=0 \mid x ; \theta) &=1-h_{\theta}(x)
\end{aligned}
$$
 
为了运算方便，我们可以把它写成

$$
\mathbb{P}(y \mid x ; \theta)=\left(h_{\theta}(x)\right)^{y}\left(1-h_{\theta}(x)\right)^{1-y}
$$
 
有了 $y$ 的分布，我们就能写出 $\theta$ 的似然函数

$$
\begin{aligned}
L(\theta) &=p(\vec{y} \mid \vec{x} ; \theta) \\
&=\prod_{i=1}^{n}\left(h_{\theta}(x^{(i)})\right)^{y^{(i)}}\left(1-h_{\theta}(x^{(i)})\right)^{1-y^{(i)}}
\end{aligned}
$$

取对数似然函数

$$
\begin{aligned}
\ell(\theta) &=\log L(\theta) \\
&=\sum_{i=1}^{n} y^{(i)} \log h\left(x^{(i)}\right)+\left(1-y^{(i)}\right) \log \left(1-h\left(x^{(i)}\right)\right)
\end{aligned}
$$

我们的目标就是调整 $\theta$ 使得函数值最大，可以使用梯度下降（或许这里应该叫做梯度上升）方法，每次

$$\theta := \theta + \eta \nabla_{\theta} \ell(\theta)$$

只需要求解梯度就行了，先计算一个样本的情况

$$\begin{aligned}\frac{\partial}{\partial\theta_{k}} (y\log{h(x)}+(1-y)\log{(1-h(x))})
&= \frac{y\frac{\partial h(x)}{\partial\theta_{k}}}{h(x)} - \frac{(1-y)\frac{\partial h(x)}{\partial\theta_{k}}}{1-h(x)} \\
&= \frac{y-h(x)}{h(x)(1-h(x))} \frac{\partial g(\theta^{T} x)}{\partial \theta_{k}} \\
&= \frac{y-h(x)}{h(x)(1-h(x))} \frac{\partial g(\theta^{T} x)}{\partial (\theta^{T} x)} \frac{\partial (\theta^{T} x)}{\partial (\theta_{k})} \\
&= \frac{y-h(x)}{h(x)(1-h(x))} g(\theta^{T} x)(1 - g(\theta^{T} x)) \frac{\partial (\theta^{T} x)}{\partial (\theta_{k})} \\
&= (y-h(x)) x_{k}
\end{aligned}$$

因此所有样本合起来就是

$$
\frac{\partial}{\partial \theta_{k}} \ell(\theta) = \sum_{i=1}^{n} (y^{(i)} - h_{\theta}(x^{(i)}))x_{k}^{(i)}
$$

因此梯度下降的规则就是

$$\theta_{k}:= \theta_{k} + \eta \sum_{i=1}^{n}(y^{(i)}-h_{\theta}(x^{(i)}))x_{k}^{(i)}$$

在上面讨论的逻辑回归中，我们使用的预测函数是连续的，那么如何得到一个非零即一的结果呢？

我们取 *threshold function(阈值函数)*

$$
g(z)= \begin{cases}1 & \text { if } z \geq 0 \\ 0 & \text { if } z<0\end{cases}
$$

以及预测函数 $h_{\theta}(x) = g(\theta^{T}x)$，对应的梯度下降规则是一样的

$$\theta_{k}:= \theta_{k} + \eta \sum_{i=1}^{n}(y^{(i)}-h_{\theta}(x^{(i)}))x_{k}^{(i)}$$

为什么这两个不同的预测函数却得到了相同的下降规则呢？在纸上推导一遍就会发现，在求解梯度的时候我们都用到了

$$g^{\prime}(z) = g(z)(1-g(z))$$

这条性质，而这两个函数都满足这样的性质。

## 4. *Generalized Linear Models(广义线性模型)*

这一节我们解决一个问题，预测函数应该如何设计？不过在此之前，我们先介绍 *exponential family(指数分布族)*

$$
p(y ; \eta)=b(y) \exp \left(\eta^{T} T(y)-a(\eta)\right)
$$

指数分布族表示在给定参数 $\eta$ 下的一组概率分布，机器学习研究中的大多数概率分布都能表示成这样的形式，其中

- $\eta$ - *natural parameter(自然参数)*
- $T(y)$ - *sufficient statistic(充分统计量)*，多数情况下 $T(y)=y$
- $a(\eta)$ - *log partition function(对数归一化函数)*，用来保证 $p$ 的积分为 $1$

值得一提得是，$\eta, T(y)$ 在多数情况下是标量，但是也可以是向量，我们最后会介绍一个向量的例子。

在逻辑回归中，我们的预测值服从伯努利分布 $y \sim \mathcal{B}(\phi)$，即

$$\mathbb{P}(y;\phi) = \phi^{y}(1-\phi)^{1-y}$$

我们尝试把它写成指数分布族的形式

$$\begin{aligned}
p(y ; \phi) &=\phi^{y}(1-\phi)^{1-y} \\
&=\exp (y \log \phi+(1-y) \log (1-\phi)) \\
&=\exp \left(\left(\log \left(\frac{\phi}{1-\phi}\right)\right) y+\log (1-\phi)\right) .
\end{aligned}$$

因此对应的参数就是

$$T(y)=y,\quad b(y)=1,\quad  \eta = \log \left(\frac{\phi}{1-\phi}\right),\quad a(\eta)=-\log (1-\phi)$$

反解得到 $\phi = \frac{1}{1+e^{-\eta}}$，代入得 

$$a(\eta)=\log{(1+e^{\eta})}$$

接下来我们就要引入广义线性模型了，我们通常把它简写为 GLM，首先明确 GLM 的设计：

- $\mathbb{P}(y|x;\theta) \in \text{ExpFamily}(\eta)$
- 模型的目标是得到预测函数 $h_{\theta}(x) = \mathbb{E}(T(y)|x;\theta)$
- $\eta = \theta^{T}x$

至于为什么这么设计目前无法解释，只知道这样设计可以得到一些表现优秀的学习算法。

我们尝试用 GLM 求解伯努利分布的预测函数

$$\begin{aligned}h_{\theta}(x) 
&= \mathbb{E}(y|x;\theta) = \mathbb{P}(y=1|x;\theta) \\
&= \phi = \frac{1}{1+e^{-\eta}} = \frac{1}{1+e^{-\theta^{T}x}}
\end{aligned}$$

我们就此得到了神奇的 *sigmod* 函数，解决了逻辑回归的预测函数的疑问。

接下来我们在回过头来看线性回归，我们知道线性回归服从高斯分布 $y \sim \mathcal{N}(\mu, \sigma^{2})$，其中方差对结果无影响，为了计算方便，假设 $\sigma^{2}=1$

按照 GLM 的一套流程，首先把分布写成指数分布族

$$\begin{aligned}
\mathbb{P}(y ; \mu) &=\frac{1}{\sqrt{2 \pi}} \exp \left(-\frac{1}{2}(y-\mu)^{2}\right) \\
&=\frac{1}{\sqrt{2 \pi}} \exp \left(-\frac{1}{2} y^{2}\right) \cdot \exp \left(\mu y-\frac{1}{2} \mu^{2}\right)
\end{aligned}$$

得到了指数分布族的各个参数

$$\eta = \mu, \quad T(y)=y,\quad a(\eta) = \frac{\eta^{2}}{2},\quad b(y) = \frac{1}{\sqrt{2\pi}}\exp{(-\frac{1}{2}y^{2})}$$

因此预测函数

$$h_{\theta}(x)=\mathbb{E}(y|x;\theta) = \mu = \eta = \theta^{T}x$$

## 5. *Softmax Regression*

逻辑回归的目的是解决二分类问题，*softmax* 回归则是要解决 $k$ 分类问题，即 $y\in \{1,2,\cdots,k\}$，那么 $y$ 服从参数为 $\phi_{1},\phi_{2},\cdots,\phi_{k}$ 多项式分布，其中

$$\phi_{i} = \mathbb{P}(y=i),\quad \phi_{k} = 1-\sum_{i=1}^{k-1}\phi_{i}$$

为了将多项式分布表示为指数分布族，我们取 $T(y)\in \mathbb{R}^{k-1}$ 的值为

$$T(1)=\left[\begin{array}{c}
1 \\
0 \\
0 \\
\vdots \\
0
\end{array}\right], T(2)=\left[\begin{array}{l}
0 \\
1 \\
0 \\
\vdots \\
0
\end{array}\right], T(3)=\left[\begin{array}{l}
0 \\
0 \\
1 \\
\vdots \\
0
\end{array}\right], \cdots, T(k-1)=\left[\begin{array}{c}
0 \\
0 \\
0 \\
\vdots \\
1
\end{array}\right], T(k)=\left[\begin{array}{c}
0 \\
0 \\
0 \\
\vdots \\
0
\end{array}\right]$$

在这里，$T(y),\eta$ 不再是标量，而是向量，为了方便计算，我们引入 *indicator function(指示函数)*

$$I(A) = \begin{cases}
0, & \text{A is false} \\
1, & \text{A is true}
\end{cases}$$

例如 $I(2=3) = 0，I(2<3) = 1$，现在我们可以把分布写成指数分布族的形式

$$\begin{aligned}\mathbb{P}(y;\theta)
&= \prod_{i=1}^{k}\phi_{i}^{I(y=i)} = \left(\prod_{i=1}^{k-1} \phi_{i}^{I(y=i)}\right) \phi_{k}^{1-\sum_{i=1}^{k-1}I(y=i)}\\
&= \left(\prod_{i=1}^{k-1} \phi_{i}^{T(y)_{i}}\right) \phi_{k}^{1-\sum_{i=1}^{k-1}T(y)_{i}}\\
&= \exp{\left(\left(\sum_{i=1}^{k-1}T(y)_{i}\log{\frac{\phi_{i}}{\phi_{k}}}\right) + \log{\phi_{k}}\right)}
\end{aligned}$$

对照 $b(y) \exp \left(\eta^{T} T(y)-a(\eta)\right)$ 的表达式可以得到

$$a(\eta) = -\log{\phi_{k}},\quad b(y)=1, \quad \eta=\left[\begin{array}{c}
\log \left(\frac{\phi_{1}}{\phi_{k}}\right) \\
\log \left(\frac{\phi_{2}}{\phi_{k}}\right) \\
\vdots \\
\log \left(\frac{\phi_{k-1}}{\phi_{k}}\right)
\end{array}\right]$$

接下来我们通过 $\eta$ 反解 $\phi$

$$\eta_{j} = \log(\frac{\phi_{j}}{\phi_{k}}) \Rightarrow \phi_{j} = e^{\eta_{j}} \phi_{k}$$

两边求和得到 

$$\sum_{j=1}^{k-1} \phi_{j} = \phi_{k} \sum_{j=1}^{k-1} e^{\eta_{j}} = 1 - \phi_{k}$$

解得

$$\phi_{k} = \frac{1}{1 + \sum_{j=1}^{k-1}e^{\eta_{j}}}$$

最后计算得到我们的预测函数

$$\begin{aligned}h_{\theta}(x) 
&= \mathbb{E}(T(y)|x;\theta) 
= \mathbb{E}\left[\begin{array}{c}
I(y=1) \\
I(y=2) \\
\vdots \\
I(y=k-1)
\end{array}\right] = \left[\begin{array}{c}
\phi_{1} \\
\phi_{2} \\
\vdots \\
\phi_{k-1}
\end{array}\right] \\
&= \left[\begin{array}{c}
\frac{\exp{{(\eta_{1})}}}{1+\sum_{j=1}^{k-1}\exp(\eta_{j})} \\
\frac{\exp{{(\eta_{2})}}}{1+\sum_{j=1}^{k-1}\exp(\eta_{j})} \\
\vdots \\
\frac{\exp{{(\eta_{k-1})}}}{1+\sum_{j=1}^{k-1}\exp(\eta_{j})}
\end{array}\right] = \left[\begin{array}{c}
\frac{\exp{{(\theta_{1}^{T}x)}}}{1+\sum_{j=1}^{k-1}\exp(\theta_{j}^{T}x)} \\
\frac{\exp{{(\theta_{2}^{T}x)}}}{1+\sum_{j=1}^{k-1}\exp(\theta_{j}^{T}x)} \\
\vdots \\
\frac{\exp{{(\theta_{k-1}^{T}x)}}}{1+\sum_{j=1}^{k-1}\exp(\theta_{j}^{T}x)}
\end{array}\right]
\end{aligned}$$

接下来我们要得到损失函数，还是同样的做法，对 $\theta$ 做极大似然估计

$$\begin{aligned}
\ell(\theta) &=\sum_{i=1}^{n} \log p\left(y^{(i)} \mid x^{(i)} ; \theta\right) \\
&=\sum_{i=1}^{n} \log \prod_{l=1}^{k} h_{\theta_{l}}(x^{(i)})^{I(y^{(i)}=l)} \\
&=\sum_{i=1}^{n} \sum_{l=1}^{k} I(y^{(i)}=l) \log{h_{\theta_{l}}(x^{(i)})}
\end{aligned}$$

我们取 *cross entropy function(交叉熵函数)*

$$H(y^{(i)}, \hat{y}^{(i)}) = \sum_{l=1}^{k} I(y^{(i)=l})\log{\hat{y}^{(i)}}$$

那么

$$\ell(\theta) = \sum_{i=1}^{n} H(y^{(i)},h_{\theta_{l}}(x^{(i)}))$$

我们的目标是最大化 $\theta$ 的似然函数，也就是最小化

$$J(\theta) = -\frac{1}{n}\sum_{i=1}^{n} H(y^{(i)},h_{\theta_{l}}(x^{(i)}))$$

这就是我们的损失函数，至于求均值的操作，是为了排除样本数量的影响。
