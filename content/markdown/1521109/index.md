---
type: markdown
title: 贝塞尔曲线
slug: 1521109
date: 2023-06-29
updatedAt: 2026-06-23 15:58:11
tags:
  - 基础数学
published: true
category: mathmatics
---

## *1. Basic Bezier Curves(基础贝塞尔曲线)*

> **Definition 1.** 给定两个控制点 $P_{0},P_{1}$，我们定义 *linear bezier curve(线性贝塞尔曲线)* 为
> $$B(t) = (1-t) P_{0} + t P_{1}, \quad t\in[0,1]$$ 即线段 $P_{0}P_{1}$ 的参数方程，我们称 $B(t)$ 为线段 $P_{0}P_{1}$ 的 $t$ 分位点。

<div></div>

> **Definition 2.** 给定三个控制点 $P_{0},P_{1},P_{2}$，我们先取线段 $P_{0}P_{1},P_{1}P_{2}$ 的 $t$ 分位点
> $$B_{0} = (1-t) P_{0} + t P_{1}$$  $$B_{1} = (1-t) P_{1} + t P_{2}$$ 我们定义 *quadratic bezier curve(二次贝塞尔曲线)* 为
 $$\begin{aligned}B(t) 
 &= (1-t) B_{0} + t B_{1}\\
 &= (1-t)^{2}P_{0} + 2t(1-t)P_{1} + t^{2}P_{2},
 \quad t\in[0,1]
\end{aligned} $$

如下图所示，这是一个二次贝塞尔曲线的例子

<center><img src="/content-images/external/c027347c0207970a03daf604b8860870.png" height=250></center>

- 当 $t=0.25$ 时，曲线上的点位于蓝色线段的四等分点。
- 当 $t=0.50$ 时，曲线上的点位于蓝色线段的中点。
- 当 $t$ 遍历 $[0,1]$ 时，得到的点就形成了贝塞尔曲线。

> **Definition 3.** 给定 $n + 1$ 个控制点 $P_{0},\ldots,P_{n}$，我们递归的定义 $n$ 阶贝塞尔曲线为
> $$B(t) = (1-t)B_{P_{0},\ldots,P_{n-1}}(t) + t B_{P_{1},\ldots,P{n}}(t)$$ 

也就是说我们先计算前 $n$ 个控制点和后 $n$ 个控制点的曲线，然后取这两条曲线上参数 $t$ 对应的两个点，取它们连线的 $t$ 分位点作为最终的 $B(t)$.

根据递归式，我们可以写出贝塞尔曲线的解析式。

> **Theorem 4.** 给定 $n + 1$ 个控制点 $P_{0},\ldots,P_{n}$ 对应的 $n$ 阶贝塞尔曲线的解析式为
> $$B(t)=\sum_{i=0}^n \binom{n}{i} t^i(1-t)^{n-i} P_i, \quad t \in[0,1]$$

根据递归式，我们可以将控制点 $P_{0},\ldots,P_{n}$ 进行分解，并算出每一项的贡献

$$P_{0},\ldots,P_{n} \begin{matrix}
\overset{1-t}{\rightarrow}& P_{0},\ldots,P_{n-1} \begin{matrix}
\overset{1-t}{\rightarrow} &P_{0},\ldots,P_{n-2} & \\ 
\overset{t}{\rightarrow} &P_{1},\ldots,P_{n-1} & 
\end{matrix} \\ 
\overset{t}{\rightarrow}& P_{1},\ldots,P_{n} \begin{matrix}
\overset{1-t}{\rightarrow}&P_{1},\ldots,P_{n-1} & \\ 
\overset{t}{\rightarrow}&P_{2},\ldots,P_{n} & 
\end{matrix}
\end{matrix}$$

根据上面的图示，我们可以发现

- 左边每减少一个控制点，该项有系数 $t$ 的贡献。
- 右边每减少一个控制点，该项有系数 $1-t$ 的贡献。

我们最终的目标是通过左右减少控制点的方式，把 $P_{0},\ldots,P_{n}$ 分解到每个单独的控制点 $P_{i}$ 上，可以发现分解到最后时

- 左边共减少了 $i$ 个控制点 $P_{0},\ldots,P_{i-1}$，贡献系数为 $t^{i}$
- 右边共减少了 $n-i$ 个控制点 $P_{i+1},\ldots,P_{n}$，贡献系数为 $(1-t)^{n-i}$

而左右减少控制点的顺序对应了得到这一项的方案数，也就是 $\binom{n}{i}$，因此

$$B(t)=\sum_{i=0}^n \binom{n}{i} t^i(1-t)^{n-i} P_i$$

我们可以记

$$w_{i}(t) = \left(\begin{array}{c}
n \\
i
\end{array}\right) t^i(1-t)^{n-i}$$

表示控制点 $P_{i}$ 的权重，它刻画了 $t$ 时刻该控制点对曲线的影响程度，且根据二项式定理，所有控制点的权重之和为 $1$.

> **Theorem 5.** 对于 $n + 1$ 个控制点 $P_{0},\ldots,P_{n}$ 对应的 $n$ 阶贝塞尔曲线 $B(t)$，有
> （1）曲线在 $P_{0}$ 处的切线经过点 $P_{1}$
> （2）曲线在 $P_{n}$ 处的切线经过点 $P_{n-1}$

证明：我们将 $B(t)$ 写成

$$B(t) = (1-t)^n P_0+n t(1-t)^{n-1} P_1 + \left[\sum_{i=2}^{n-1} \binom{n}{i} t^i(1-t)^{n-i} P_i\right] + t^{n}P_{n}$$

求导得到

$$B^{\prime}(t) = -n(1-t)^{n-1}P_{0} + n\left((1-t)^{n-1}-t(n-1)(1-t)^{n-2}\right) P_{1} + \Delta(t) + nt^{n-1}P_{n}$$

其中

$$\Delta(t) = \sum_{i=2}^{n-1} \binom{n}{i} \left(i t^{i-1}(1-t)^{n-i}-t^i(n-i)(1-t)^{n-i-1}\right) P_i$$

我们发现 $\Delta(0) = 0$，因此

$$B^{\prime}(0) = -nP_{0} + nP_{1} = n(P_{1}-P_{0})$$

这样就说明了在 $0$ 处的切线过 $P_{1}$，另一半的证明也是类似的。

> **Definition 6.** 对于 $n + 1$ 个点的点集 $S = \{P_{0},\ldots,P_{n}\}$，定义 $S$ 上的 *convex hull(凸包)* 为
> $$\operatorname{CH}(S) = \left\{w_{0} P_0+\cdots+ w_n P_{n} \mid w_i \in[0,1] , \sum_{i=0}^n w_i=1\right\}$$

如下图例子所示，是一个由所有红点色生成的凸包（灰色部分）

<center>![](/content-images/external/38be06ec4883f0c4d90ae141084f036d.png)</center>

> **Theorem 7.** 对于 $n + 1$ 个控制点 $P_{0},\ldots,P_{n}$ 对应的 $n$ 阶贝塞尔曲线 $B(t)$，曲线位于由控制点生成的凸包之内。

由于内塞尔曲线的解析式

$$B(t)=\sum_{i=0}^n \binom{n}{i} t^i(1-t)^{n-i} P_i$$

满足凸包表达式的条件 $w_i \in[0,1], \sum_{i=0}^n w_i=1$，因此曲线上的点必然在 $\operatorname{CH}(S)$ 内。

---

## *2. Basic B-Spline Curve(基础B样条曲线)*

贝塞尔曲线是光滑的，即处处连续可导，但是它的缺点在于控制点牵一发而动全身，只要有一个控制点发生变动，整条曲线都会受到影响。

很多时候我们想要的是一条光滑曲线，而每个控制点能够控制曲线上的某一段，而不是全部。

一个比较自然的想法是用 $m+1$ 个 *knots(节点)* $t_{0},\ldots,t_{m}$ 将曲线划分为 $m$ 段，然后设计合适的权重函数 $w_{i}(t)$ 使得控制点 $P_{i}$ 仅影响 $[t_{i},t_{i+1},\ldots,t_{i+m-n}]$ 段的曲线。

我们记 $k=m-n-1$ 表示曲线的次数，那么控制点 $P_{i}$ 的影响范围就是 $[t_{i},\ldots,t_{i+k+1}]$.

> **Example 8.** 如下图所示
> <center><img src="/content-images/external/0bc86dd1be1d57c80e6868813c9df62d.png", width=650></center>
> 共有 $5$ 个控制点，我们把曲线划分为了 $9$ 段，因此 $n=4,m=9,k=4$，通常情况下，我们使用节点表
> $$\text{knots} = \left[0, \frac{1}{9}, \frac{2}{9}, \frac{3}{9}, \frac{4}{9}, \frac{5}{9}, \frac{6}{9}, \frac{7}{9}, \frac{8}{9}, 1\right]$$ 均匀的划分曲线，每个控制点会影响 $5$ 段曲线，即
> 
> - $P_{0}$ 的影响范围是 $[t_{0}, t_{5}]$.
> - $P_{1}$ 的影响范围是 $[t_{1}, t_{6}]$.
> - $P_{2}$ 的影响范围是 $[t_{2}, t_{7}]$.
> - $P_{3}$ 的影响范围是 $[t_{3}, t_{8}]$.
> - $P_{4}$ 的影响范围是 $[t_{4}, t_{9}]$.

接下来就是确定曲线

$$B(t) =\sum_{i=0}^{n} w_{i}(t)P_{i}$$

的各项权重 $w_{i}(t)$ 了，我们需要选择合适的权重使得曲线光滑，且

$$\sum_{i=0}^{n}w_{i}(t) = 1, \quad t\in[0,1]$$

恒成立，最重要的是保证每个控制点 $P_{i}$ 的影响范围是 $[t_{i},t_{i+k+1}]$，即

$$w_{i}(t) = \left\{\begin{matrix}
b_{i,k}(t), & t \in [t_{i},t_{i+k+1}]\\ 
0,    & \text{others}
\end{matrix}\right.$$

其中 $b_{i,k}(t)$ 是 *basic function(基函数)*，它可以通过下图所示的递推方式得到

<center><img src="/content-images/external/180de0b2ea14bf7ce9bc0c870d2c4ac3.png" width=350px></center>

从图中可以看到，$b_{i,k}$ 的影响范围是 $[t_{i},t_{i+k+1}]$，且 $i \in [0, m-k-1]$

当 $k = 0$ 时，每个控制点 $P_{i}$ 仅影响一段曲线 $[t_{i},t_{i+1}]$ ，加上权重之和为 $1$ 的限制，有 

$$b_{i,0}(t) = \left\{\begin{matrix}
1, & t \in [t_{i},t_{i+1}]\\ 
0,    & \text{others}
\end{matrix}\right.$$

当 $k > 0$ 时，我们令

$$b_{i,k}(t) = \frac{t-t_{i}}{t_{i+k}-t_{i}} b_{i,k-1}(t) + \frac{t_{i+k+1}-t}{t_{i+k+1} - t_{i+1}}b_{i+1,k-1}(t)$$

然后验证权重之和为 $1$，注意到

$$b_{i,k}(t) + b_{i+1,k}(t) = b_{i+1,k-1}(t) + \Delta$$

其中 $\Delta$ 表示其它项，我们发现这里的递推方式相当于将 $b_{i+1,k-1}$ 分解到了 $b_{i,k}$ 和 $b_{i+1,k}$ 上面，那么根据数学归纳法，如果 $k-1$ 层满足权重和为 $1$，则 $k$ 层一定也满足。

如此就得到了我们的 *B-spline curve(B样条曲线)*.

> **Definition 9.** 给定 $n+1$ 个控制点 $P_{0},\ldots,P_{n}$，定义 $k$ 次*B*样条曲线的生成方法如下：
> 
> 1. 使用节点列表将曲线区间 $[0,1]$ 划分为 $m= n+k+1$ 段
> $$\text { knots }=\left[t_{0},t_{1},\ldots, t_{m}\right]$$ 
> 2. 利用递推式计算基函数
> $$\begin{aligned}b_{i,0}(t) &= \left\{\begin{matrix}
1, & t \in [t_{i},t_{i+1}]\\ 
0,    & \text{others} 
\end{matrix}\right.\\
b_{i, k}(t)&=\frac{t-t_i}{t_{i+k}-t_i} b_{i, k-1}(t)+\frac{t_{i+k+1}-t}{t_{i+k+1}-t_{i+1}} b_{i+1, k-1}(t)
\end{aligned}$$
> 3. 对所有控制点加权平均得到解析式
> $$B(t) = \sum_{i=0}^{n}b_{i,k} P_{i}$$

---

## *Reference*

- http://www.math.umd.edu/~immortal/MATH431/book/ch_bezier.pdf
- https://javascript.info/bezier-curve
- https://pomax.github.io/bezierinfo/zh-CN/index.html
- https://blog.csdn.net/deepsprings/article/details/107828889
- https://people.computing.clemson.edu/~dhouse/courses/405/notes/splines.pdf
