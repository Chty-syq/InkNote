---
type: markdown
title: Matrix Calculus
slug: "4748532"
date: 2021-11-15
updatedAt: 2026-06-29 17:18:27
tags:
  - 微积分
  - 基础数学
published: true
category: mathmatics
---

## *1. Introduction(引入)*

我们已经熟知标量上的微积分知识，例如对于函数 

$$y = f(x_{1},x_{2},\cdots,x_{n}) = \sum_{i=1}^{n} i x_{i}^{2}$$

我们可以轻松求出

$$\frac{\partial y}{\partial x_{i}} = 2ix_{i}, \quad i\in [1,n]$$

这样的书写显得很不直观，我们可以用向量的形式直观的表示这个求导的过程，设 $\boldsymbol{x} = [x_{1}, x_{2}, \cdots, x_{n}]^{T}$，则

$$\frac{\partial y}{\partial \boldsymbol{x}} = \begin{bmatrix}
\frac{\partial y}{\partial x_{1}} \\
\frac{\partial y}{\partial x_{2}} \\
\vdots \\
\frac{\partial y}{\partial x_{n}}
\end{bmatrix} = \begin{bmatrix}
2x_{1} \\
4x_{2} \\
\vdots \\
2nx_{n}
\end{bmatrix}$$

这就是 *scalar-by-vector(标量对向量)* 的求导，把 $\boldsymbol{x}$ 换成矩阵也是一样的，对于 $X \in \mathbb{R}^{n\times m}$，有

$$\frac{\partial y}{\partial \boldsymbol{X}} = \begin{bmatrix}
\frac{\partial y}{\partial X_{11}} & \frac{\partial y}{\partial X_{12}} & \cdots & \frac{\partial y}{\partial X_{1m}} \\
\frac{\partial y}{\partial X_{21}} & \frac{\partial y}{\partial X_{22}} & \cdots & \frac{\partial y}{\partial X_{2m}} \\
\vdots & \vdots & & \vdots \\
\frac{\partial y}{\partial X_{n1}} & \frac{\partial y}{\partial X_{n2}} & \cdots & \frac{\partial y}{\partial X_{nm}}
\end{bmatrix}$$

这就是 *scalar-by-matrix(标量对矩阵)* 的求导。

现在换一个问题，我们有一组函数 

$$y_{i} = f_{i}(x) = ix^{2}$$

我们可以轻松写出它们的导数

$$\frac{\partial y_{i}}{\partial x} = 2ix$$

这样同样很不直观，我们设 $\boldsymbol{y} = [y_{1},y_{2},\cdots, y_{n}]^{T}$，则

$$\frac{\partial \boldsymbol{y}}{\partial x} = \begin{bmatrix}
\frac{\partial y_{1}}{\partial x} \\
\frac{\partial y_{2}}{\partial x} \\
\vdots \\
\frac{\partial y_{n}}{\partial x}
\end{bmatrix} = 
\begin{bmatrix}
2x \\
4x \\
\vdots \\
2nx
\end{bmatrix}$$

这就是 *vector-by-scalar(向量对标量)* 的求导，进一步扩展到矩阵，对于 $Y\in \mathbb{R}^{n\times m}$，有

$$\frac{\partial \boldsymbol{Y}}{\partial x} = \begin{bmatrix}
\frac{\partial Y_{11}}{\partial x} & \frac{\partial Y_{12}}{\partial x} & \cdots & \frac{\partial Y_{1m}}{\partial x} \\
\frac{\partial Y_{21}}{\partial x} & \frac{\partial Y_{22}}{\partial x} & \cdots & \frac{\partial Y_{2m}}{\partial x} \\
\vdots & \vdots & & \vdots \\
\frac{\partial Y_{n1}}{\partial x} & \frac{\partial Y_{n2}}{\partial x} & \cdots & \frac{\partial Y_{nm}}{\partial x} \\
\end{bmatrix} $$

这就是 *matrix-by-scalar(矩阵对标量)* 的求导。

---

## *2. Vector-by-vector Derivatives(向量对向量的求导)*

现在我们发现矩阵微分学似乎没有我们想象中的那么难懂，仅仅是把矩阵中的每个元素拿出来求导，然后按照顺序排列起来就行了。

那么问题来了，这个顺序究竟是什么顺序呢？我们观察一下上面的结果

- 在 *scalar-by-vector* 中，求导的结果是 $n\times 1$ 的，和分母 $\boldsymbol{x}\in \mathbb{R}^{n\times 1}$ 是一致的。
- 在 *scalar-by-matrix* 中，求导的结果是 $n\times m$ 的，和分母 $\boldsymbol{X}\in \mathbb{R}^{n\times m}$ 是一致的。
- 在 *vector-by-scalar* 中，求导的结果是 $n\times 1$ 的，和分子 $\boldsymbol{y}\in \mathbb{R}^{n\times 1}$ 是一致的。
- 在 *matrix-by-scalar* 中，求导的结果是 $n\times m$ 的，和分子 $\boldsymbol{Y}\in \mathbb{R}^{n\times m}$ 是一致的。

那如果是 $\boldsymbol{y} \in \mathbb{R}^{n}, \boldsymbol{x}\in \mathbb{R}^{m}$，求导的结果应该长什么样子呢？

- 可以按照分子展开，求导的结果是 $n\times m$ 的矩阵，这种排列称为 *numerator layout(分子布局)*

$$\frac{\partial \boldsymbol{y}}{\partial \boldsymbol{x}} = \begin{bmatrix}
\frac{\partial y_{1}}{\partial \boldsymbol{x}} \\
\frac{\partial y_{2}}{\partial \boldsymbol{x}} \\
\vdots \\
\frac{\partial y_{n}}{\partial \boldsymbol{x}}
\end{bmatrix} = \begin{bmatrix}
\frac{\partial y_{1}}{\partial x_{1}} & \frac{\partial y_{1}}{\partial x_{2}} & \cdots & \frac{\partial y_{1}}{\partial x_{m}} \\
\frac{\partial y_{2}}{\partial x_{1}} & \frac{\partial y_{2}}{\partial x_{2}} & \cdots & \frac{\partial y_{2}}{\partial x_{m}} \\
\vdots & \vdots & & \vdots \\
\frac{\partial y_{n}}{\partial x_{1}} & \frac{\partial y_{n}}{\partial x_{2}} & \cdots & \frac{\partial y_{n}}{\partial x_{m}} \\
\end{bmatrix}
$$

- 可以按照分母展开，求导的结果是 $m \times n$ 的矩阵，这种排列称为 *denominator layout(分母布局)*

$$\frac{\partial \boldsymbol{y}}{\partial \boldsymbol{x}} = \begin{bmatrix}
\frac{\partial \boldsymbol{y}}{\partial x_{1}} \\
\frac{\partial \boldsymbol{y}}{\partial x_{2}} \\
\vdots \\
\frac{\partial \boldsymbol{y}}{\partial x_{m}} \\
\end{bmatrix} = \begin{bmatrix}
\frac{\partial y_{1}}{\partial x_{1}} & \frac{\partial y_{2}}{\partial x_{1}} & \cdots & \frac{\partial y_{n}}{\partial x_{1}} \\
\frac{\partial y_{1}}{\partial x_{2}} & \frac{\partial y_{2}}{\partial x_{2}} & \cdots & \frac{\partial y_{n}}{\partial x_{2}} \\
\vdots & \vdots & & \vdots \\
\frac{\partial y_{1}}{\partial x_{m}} & \frac{\partial y_{2}}{\partial x_{m}} & \cdots & \frac{\partial y_{n}}{\partial x_{m}} \\
\end{bmatrix}
$$

可以看到分子布局与分母布局互为转置，在进行 *vector-by-vector* 求导时需要指明是哪种布局。

---

## *3. Calculate the Derivatives by Definition(定义法计算导数)*

在机器学习中，我们常常需要计算 *scalar-by-vector* 或 *scalar-by-matrix* 的导数，其中我们的 *scalar* 通常是一个实值函数 $f: \mathbb{R}^{n\times m} \rightarrow \mathbb{R}$，我们先看一些简单的例子。

> **Example 1.** 设 $\boldsymbol{a},\boldsymbol{x} \in \mathbb{R}^{n}$，求解
> $$\frac{\partial}{\partial \boldsymbol{x}} (\boldsymbol{a}^{T}\boldsymbol{x})$$

根据定义，我们尝试对分量 $x_{k}$ 求导

$$\frac{\partial}{\partial x_{k}} (\boldsymbol{a}^{T}\boldsymbol{x}) = \frac{\partial}{\partial x_{k}} \sum_{i=1}^{n}a_{i}x_{i} = a_{k}$$

按照分母布局进行排列得到

$$\frac{\partial}{\partial \boldsymbol{x}} (\boldsymbol{a}^{T}\boldsymbol{x}) = \boldsymbol{a}$$

> **Example 2.** 设 $x \in \mathbb{R}^{d}, A\in \mathbb{R}^{d\times d}$，证明：
> $$\frac{\partial}{\partial x} (x^{T}Ax) = (A^{T} + A) x$$

还是同样的思路，先对分量 $x_{k}$ 求导

$$\begin{aligned}\frac{\partial(x^{T}Ax)}{\partial x_{k}}
&= \frac{\partial}{\partial x_{k}} \sum_{i=1}^{d}\sum_{j=1}^{d} x^{T}_{i}A_{i,j}x_{j} \\
&= \frac{\partial}{\partial x_{k}} \sum_{i=1,i\neq k}^{d} x_{i}A_{i,k}x_{k} + \frac{\partial}{\partial x_{k}}\sum_{j=1,j\neq k}^{d}x_{k}A_{k,j}x_{j} + \frac{\partial}{\partial x_{k}} A_{k,k}x_{k}^{2} \\ 
&= \sum_{i=1,i\neq k}^{d} x_{i}A_{i,k} + \sum_{j=1,j\neq k}^{d} A_{k,j}x_{j} + 2A_{k,k} x_{k} \\
&= \sum_{i=1}^{d} x_{i}A_{i,k} + \sum_{j=1}^{d} A_{k,j}x_{j} = (A^{T}x)_{k} + (Ax)_{k}
\end{aligned}$$

因此

$$\frac{\partial(x^{T}Ax)}{\partial x} =(A^{T}+A)x$$

> **Example 3.**设 $a\in \mathbb{R}^{n}, A\in \mathbb{R}^{n\times m}, b\in \mathbb{R}^{m}$，证明：
> $$\frac{\partial}{\partial X}(a^{T}Xb) = ab^{T}$$

还是一样的思路，先对分量 $X_{p,q}$ 求导

$$\begin{aligned}\frac{\partial}{\partial X_{p,q}}(a^{T}Xb) 
&= \frac{\partial}{\partial X_{p,q}}\sum_{i=1}^{n}\sum_{j=1}^{m}a^{T}_{i}X_{i,j}b_{j} \\
&= a_{p} b_{q} = (ab^{T})_{p,q}
\end{aligned}$$

> **Example 4.** 若 $A\in \mathbb{R}^{d\times d}$，且 $A$ 可逆，证明：
> $$\frac{\partial |A|}{\partial A} = |A|(A^{-1})^{T}$$

证明：设 $C$ 为 $A_{i,j}$ 的 *cofactor matrix(代数余子式矩阵)*，$A^{*}$ 为 $A$ 的 *adjugate  matrix(伴随矩阵)*，运算符 $+_{i,j}$ 表示对矩阵中位置 $(i,j)$ 加上某个值，则

$$\begin{aligned}\frac{\partial |A|}{\partial A_{i,j}} 
&= \lim_{\epsilon \rightarrow 0} \frac{|A +_{i,j} \epsilon| - |A|}{\epsilon} \\
&= \lim_{\epsilon \rightarrow 0} \frac{(A_{i,j} + \epsilon)C_{i,j} + \sum_{k=1,k\neq j}^{n} A_{i,k}C_{i,k} - \sum_{k=1}^{n} A_{i,k}C_{i,k}}{\epsilon} \\ 
&= \lim_{\epsilon \rightarrow 0} \frac{\epsilon C_{i,j}}{\epsilon} = C_{i,j} = A^{*}_{j,i}
\end{aligned}$$

其中 $A^{*}$ 表示 $A$ 的伴随阵，因此

$$\frac{\partial |A|}{\partial A} = (A^{*})^{T} = |A|(A^{-1})^{T}$$

值得一提的是，这个式子是 [*Jacobi's formula(雅可比公式)*](https://en.wikipedia.org/wiki/Jacobi%27s_formula) 的一个推论。

> **Example 5.** 若 $A\in \mathbb{R}^{d\times d}$ 为可逆正定阵，证明：
> $$\frac{\partial \log |A|}{\partial A}=A^{-T}$$

证明：方法和上面是一样的

$$\begin{aligned}\frac{\partial\log |A|}{\partial A_{i,j}} 
&= \lim_{\epsilon \rightarrow 0} \frac{\log|A +_{i,j} \epsilon| - \log|A|}{\epsilon} \\
&= \lim_{\epsilon \rightarrow 0} \frac{\log\left\{(A_{i,j} + \epsilon)C_{i,j} + \sum_{k=1,k\neq j}^{n} A_{i,k}C_{i,k}\right\} - \log|A|}{\epsilon} \\ 
&= \lim_{\epsilon \rightarrow 0} \frac{\log\left\{ \frac{(A_{i,j} + \epsilon)C_{i,j} - A_{i,j}C_{i,j}}{|A|} + 1\right\}}{\epsilon} \\
&= \lim_{\epsilon \rightarrow 0} \frac{\epsilon C_{i,j}}{\epsilon|A|} = \frac{A^{*}_{j,i}}{|A|} 
\end{aligned}$$

上面的推导中使用了等价无穷小 $\log(x+1) \sim x$，因此

$$\frac{\partial \log |A|}{\partial A} = \frac{|A|\left(A^{-1}\right)^T}{|A|} = A^{-T}$$

---

## *3. Trace Operator(迹运算)*

> **Definition 1. Trace(迹).** 对于矩阵 $A\in \mathbb{R}^{n\times n}$，定义迹运算 $tr: \mathbb{R}^{n\times n} \rightarrow \mathbb{R}$ 为
$$tr(A) = \sum_{i=1}^{n} A_{ii}$$ 迹运算拥有如下性质:
> 
- 标量的迹等于自身  $$tr(a) =a$$
- 转置不变性 $$tr(A^{T}) = tr(A)$$
- 乘法交换律 $$tr(AB) = tr(BA)$$
- 加法同态 $$tr(A+B) = tr(A) + tr(B)$$

--- 

## *4. Matrix derivatives(矩阵微分)*

回忆多元函数微分学，函数 $y=f(x_{1},x_{2},\cdots,x_{n})$ 的全微分可以表示为

$$dy = \sum_{i=1}^{n} \frac{\partial f}{\partial x_{i}} dx_{i} = \left(\frac{\partial f}{\partial \boldsymbol{x}}\right)^{T} d\boldsymbol{x}$$

可以推广到矩阵

$$dy = \sum_{i=1}^{n}\sum_{j=1}^{m} \frac{\partial f}{\partial X_{i,j}} dX_{i,j} = tr\left( \left(\frac{\partial f}{\partial X}\right)^{T} dX \right)$$

其中 $dX$ 表示矩阵 $X$ 的微分阵

$$dX = \begin{bmatrix}
dX_{11} & dX_{12} & \cdots & dX_{1m}\\
dX_{21} & dX_{22} & \cdots & dX_{2m}\\
\vdots  & \vdots  &        & \vdots \\
dX_{n1} & dX_{n2} & \cdots & dX_{nm}
\end{bmatrix}$$

现在我们得到了矩阵微分与导数的关系，这个关系非常重要，它意味着只要我们求出了 $y$ 的全微分 $dy$，我们就可以得到 $\frac{\partial f}{\partial X}$.

> **Lemma 1.** 矩阵微分具有很好的计算性质，例如
> 
> - 微分加减法 $$d(X+Y) = dX + dY$$
> - 微分乘法 $$d(XY) = dX \cdot Y + X \cdot dY$$
> - 微分转置 $$d(X^{T}) = (dX)^{T}$$
> - 迹运算 $$d(tr(X)) = tr(dX)$$
> - 哈达马乘积 $$d(X \odot Y)=X \odot d Y+d X \odot Y$$ 
> - 逆矩阵 $$d X^{-1}=-X^{-1} d X X^{-1}$$
> - 行列式 $$d|X|=|X| \operatorname{tr}\left(X^{-1} d X\right)$$

让我们来看一些例子。

> **Example 6.** 设 $A,B,C,X\in \mathbb{R}^{d\times d}$，求
> $$\frac{\partial}{\partial X}tr(AXBX^{T}C)$$

首先，我们求出 $tr(AXBX^{T}C)$ 的全微分

$$\begin{aligned}d (tr(AXBX^{T}C)) 
&= d (tr(CAXBX^{T})) = tr(d(CAXBX^{T}))\\
&= tr \left(d(CAX)BX^{T} + CAX d(BX^{T})  \right) \\
&= tr(CA (dX) BX^{T}) + tr(CAXB d(X^{T})) \\
&= tr(BX^{T}CA (dX)) + tr(CAXB(dX)^{T}) \\
&= tr(BX^{T}CA (dX)) + tr( B^{T}X^{T}A^{T}C^{T}(dX))
\end{aligned}$$

因此

$$\begin{aligned}\frac{\partial}{\partial X}tr(AXBX^{T}C)
&= (BX^{T}CA + B^{T}X^{T}A^{T}C^{T})^{T} \\
&= A^{T}C^{T}XB^{T} + CAXB
\end{aligned}$$

在这个例子中，按需选取 $A,B,C$ 为单位阵，可以得到以下的推论

- $\frac{\partial}{\partial X} \operatorname{tr}\left(XX^T\right) = 2X$
- $\frac{\partial}{\partial X} \operatorname{tr}\left(XBX^T\right) = X(B+B^{T})$
- $\frac{\partial}{\partial X} \operatorname{tr}\left(AXX^T\right) = (A+A^{T})X$


> **Example 7.** 若 $x\in \mathbb{R}^{d}, A\in \mathbb{R}^{d\times d}$，证明：
> $$\frac{\partial(x^{T}A^{-1}x)}{\partial A} = -(A^{-1})^{T} xx^{T} (A^{-1})^{T}$$

首先我们解决逆矩阵的微分问题，由恒等式

$$dI = d(AA^{-1}) = dA\cdot A^{-1} + A\cdot dA^{-1} = 0$$

可以得到

$$dA^{-1} = -A^{-1} (dA) A^{-1}$$

然后求全微分得到

$$\begin{aligned} d(x^{T}A^{-1}x) 
&= d(tr(x^{T}A^{-1}x)) = d(tr(xx^{T}A^{-1})) \\
&= tr(xx^{T} dA^{-1}) = tr(-xx^{T} A^{-1} (dA) A^{-1}) \\
&= tr(-A^{-1} xx^{T} A^{-1} (dA))
\end{aligned}$$

因此

$$\frac{\partial(x^{T}A^{-1}x)}{\partial A} = -(A^{-1}xx^{T}A^{-1})^{T} = -(A^{-1})^{T}xx^{T}(A^{-1})^{T}$$

## *5. Reference Links(参考链接)*

- Wikipedia: https://en.wikipedia.org/wiki/Matrix_calculus
- Pinard blog: [https://www.cnblogs.com/pinard/tag/矩阵求导%20%20向量求导/](https://www.cnblogs.com/pinard/tag/%E7%9F%A9%E9%98%B5%E6%B1%82%E5%AF%BC%20%20%E5%90%91%E9%87%8F%E6%B1%82%E5%AF%BC/)
