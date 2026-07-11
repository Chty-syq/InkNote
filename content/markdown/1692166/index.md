---
type: markdown
title: CS229 Note(9) 主成分分析
slug: "1692166"
order: 21
date: 2023-06-26
updatedAt: 2026-07-10 20:58:17
tags:
  - 机器学习
  - CS229
published: true
category: machine-learning
---

## *1. Principal Components Analysis(主成分分析)*

对于数据集 $\{x^{(i)} \in \mathbb{R}^{d} | i = 1,2\ldots,n\}$，我们真正关心的仅有其中某些维度的特征，此时我们希望将数据降维到 $k$ 维子空间内，只保留那些我们所关心的特征。

<center><img src="/content-images/external/c517fa15b4f245e4af4aed7878200616.png" width=450></center>

举个例子，如上图所示，特征 $x_{1}$ 表示飞行员的技术，$x_{2}$ 表示飞行员对航空的喜爱程度。

受其它特征的影响，虽然 $x_{1},x_{2}$ 是强相关的，但是这些样本点并不是一条直线，而是在 $u_{1}$ 方向的直线附近浮动。

我们真正关心的是 $x_{1},x_{2}$ 间的相关关系 $u_{1}$，所以我们希望消除其它特征 $u_{2}$ 的影响，即将这些样本点投影到 $u_{2}$ 方向上。

这就是 *principal components analysis(主成分分析)* 算法所要解决的问题，在此之前我们需要将数据集进行 *normalization(归一化)*，以消除各特征维度的数据分布不一致的影响。

> **Method 1. Preprocess(预处理).** 我们使用以下预处理流程来归一化数据集 $\{x^{(i)}\}$ 的均值与方差：
> 
> 1. 计算各维度特征 $x_{j}$ 的均值和方差 $$\mu_{j} =\frac{1}{n} \sum_{i=1}^n x_{j}^{(i)},\quad \sigma_j^2=\frac{1}{n} \sum_{i=1}^n\left(x_j^{(i)}-\mu_j\right)^2$$
> 2. 进行数据归一化 $$x_j^{(i)} \leftarrow \frac{x_j^{(i)}-\mu_j}{\sigma_j}$$

现在我们的目标是找到方向向量 $u\in \mathbb{R}^{d}$，使得各数据点 $x^{(i)}$ 在 $u$ 上的投影的方差最大。

如果不理解为什么目标是方差最大，可以看上面的图，各个数据点在 $u_{1}$ 上的投影点相距较远，方差较大，而在 $u_{2}$ 上的投影到非常接近，方差较小。

而投影就是向量内积，那么我们的优化目标就是


$$\max_{u: \|u\|=1} \frac{1}{n} \sum_{i=1}^n\left(x^{(i)^T} u\right)^2 =\max_{u: \|u\|=1} u^T\left(\frac{1}{n} \sum_{i=1}^n x^{(i)} x^{(i)^T}\right) u$$


这里由于数据进行了归一化，所以投影点的均值一定是 $0$，而中间的那部分就是数据集 $x^{(i)}$ 的协方差矩阵

$$\Sigma=\frac{1}{n} \sum_{i=1}^n x^{(i)} x^{(i)^T}$$

我们使用拉格朗日乘子法解除 $\|u\|=1$ 的限制

$$\ell(u,\lambda) = u^T\Sigma u - \lambda (u^{T}u - 1)$$

求梯度得到

$$\nabla_{u} \ell(u,\lambda) = 2\Sigma u - 2\lambda u = 0$$

我们发现参数 $\lambda,u$ 就是矩阵 $\Sigma$ 的特征值和特征向量。

> **Method 2. Principal Components Analysis(PCA).** 对于给定数据集 $\{x^{(1)},\ldots,x^{(n)} \}$，其中 $x^{(i)}\in\mathbb{R}^{d}$，使用 *PCA* 算法将其压缩到 $k$ 维子空间的流程如下：
>
> 1. 使用 *Method 1* 进行数据归一化
> 2. 计算协方差矩阵 $$\Sigma=\frac{1}{n} \sum_{i=1}^n x^{(i)} x^{(i)^T}$$
> 3. 求解 $\Sigma$ 的特征值(从大到小排序) $\lambda_{1},\ldots,\lambda_{d}$ 和对应的特征向量 $u_{1},\ldots,u_{d}$
> 4. 取前 $k$ 大特征值对应的 $u_{1},\ldots,u_{k}$ 并计算新的样本点 $$y^{(i)} = (u_{1}x^{(i)}, u_{2}x^{(i)},\ldots,u_{k}x^{(i)})$$

---

## *2. Singular Value Decomposition(奇异值分解)*

在实施 *PCA* 算法的过程中，求矩阵 $\Sigma$ 特征值与特征向量的开销可能非常大，例如 $x^{(i)}\in\mathbb{R}^{10000}$，那么 $\Sigma$ 中将有 $10^{8}$ 个元素

我们希望能够避免 $\Sigma$ 的计算，而奇异值分解能够解决这个问题。

> **Method 3. Singular Value Decomposition(SVD).** 给定矩阵 $A \in\mathbb{R}^{m\times n}$，必然存在分解式
> $$A = UDV^{T}, \quad U\in\mathbb{R}^{m\times n},D,V\in\mathbb{R}^{n\times n}$$ 其中 $D = \operatorname{diag}(\sigma_{1},\ldots,\sigma_{n})$，而 $\sigma_{j}$ 是矩阵 $A$ 的奇异值，也就是非负特征值的算术平方根，且
> 
> - 矩阵 $U$ 的列是 $AA^{T}$ 的特征向量。
> - 矩阵 $V$ 的列是 $A^{T}A$ 的特征向量。

我们有一些非常高效的算法来计算矩阵的 *SVD* 分解，它们被封装在很多软件包的算法库中。

设 $X = [x^{(1)},\ldots,x^{(n)}]^{T}$，则

$$\Sigma = \frac{1}{n} \sum_{i=1}^n x^{(i)} x^{(i)^T} = \frac{1}{n}X^{T}X$$

我们需要计算矩阵 $X$ 的 *SVD* 分解

$$X= UDV^{T}$$

那么我们需要的特征向量就是矩阵 $V$ 的前 $k$ 列。
