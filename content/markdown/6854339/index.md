---
type: markdown
title: Fourier Analysis Note(2) 热传导方程
slug: "6854339"
date: 2024-01-25
updatedAt: 2026-07-11 17:26:38
tags:
  - 傅里叶分析
published: true
category: mathmatics
---

## *1. Derivation of the Heat Equation(热传导方程的推导)*

> **Problem 1.** 设一个无限长的金属平面 $\mathbb{R}^{2}$，在 $t=0$ 时刻有初始温度，我们希望描述 $t$ 时刻点 $(x,y)$ 处的温度 $u(x,y,t)$.

我们考虑一个以 $(x_{0},y_{0})$ 为中心，边长为 $h$ 的正方形微元 $S$，如图所示

<center><img src="/content-images/external/7b91f99a6ba05c25488a4a17755e0515.png" width=60%></center>

该微元面片在 $t$ 时刻的总热量

$$H(t)=\sigma \iint_S u(x, y, t) d x d y$$

其中 $\sigma$ 表示该金属材料的 *specific heat(比热容)*，那么流入 $S$ 的热量就是

$$\frac{\partial H}{\partial t}=\sigma \iint_S \frac{\partial u}{\partial t} d x d y \approx \sigma h^2 \frac{\partial u}{\partial t}\left(x_0, y_0, t\right)$$

这里由于 $S$ 是一段微元，可以认为其热量均匀分布，以此来近似积分的值。

根据 *Newton’s law of cooling(牛顿冷却定律)*，热量由温度较高的地方流向温度较低的地方，且热流与其梯度成正比。因此，从中心点向右侧的热流为

$$-\kappa h \frac{\partial u}{\partial x}\left(x_0+\frac{h}{2}, y_0, t\right)$$

其中 $\kappa$ 为材料的 *conductivity(热导率)*，将四个方向上的热流相加，其结果等于流入 $S$ 的热量，即

$$\begin{aligned}
\sigma h^2 \frac{\partial u}{\partial t}\left(x_0, y_0, t\right) = \kappa h\left[\frac{\partial u}{\partial x}\right. & \left(x_0+\frac{h}{2}, y_0, t\right)-\frac{\partial u}{\partial x}\left(x_0-\frac{h}{2}, y_0, t\right) \\
& \left.+\frac{\partial u}{\partial y}\left(x_0, y_0+\frac{h}{2}, t\right)-\frac{\partial u}{\partial y}\left(x_0, y_0-\frac{h}{2}, t\right)\right]
\end{aligned}$$

根据微分中值定理，我们知道必然存在 $\xi \in (-\frac{h}{2},\frac{h}{2})$ 使得

$$\frac{\partial^{2} u}{\partial x^{2}}(\xi,y_{0},t) = \frac{1}{h}\left\{\frac{\partial u}{\partial x}\left(x_0+\frac{h}{2}, y_0, t\right)-\frac{\partial u}{\partial x}\left(x_0-\frac{h}{2}, y_0, t\right)\right\}$$

因此当 $h\rightarrow 0$ 时，我们可以得到

$$\frac{\sigma}{\kappa} \frac{\partial u}{\partial t}=\frac{\partial^2 u}{\partial x^2}+\frac{\partial^2 u}{\partial y^2}$$

这就是我们的 *heat equation(热传导方程)*.

---

## *2. Heat Equation in the Disc(圆盘上的热传导方程)*

假设在经过一段时间后，热量交换停止，此时 $u(x,y,t)$ 不再随时间变化，得到 *steady-state heat equation(稳态热传导方程)*

$$\frac{\partial^2 u}{\partial x^2}+\frac{\partial^2 u}{\partial y^2}=0$$

熟知微积分的同学可能已经发现了，$\frac{\partial^2}{\partial x^2}+\frac{\partial^2}{\partial y^2}$ 是 *Laplacian(拉普拉斯算子)*，记作

$$\Delta u(x,y) = 0$$

该方程的解我们称之为 *harmonic functions(调和函数)*.

> **Problem 2. Dirichlet Problem(狄利克雷问题).** 考虑平面上的单位圆盘
> $$D=\left\{(x, y) \in \mathbb{R}^2: x^2+y^2<1\right\}$$ 其边界为单位圆 $C$，我们希望求解稳态热传导方程
> $$\Delta u(x,y) = 0$$ 边界条件：在边界 $C$ 上，有
> $$u(x,y) = f(x,y)$$

在圆盘上直接使用 $(x,y)$ 坐标计算非常不方便，因此我们考虑转换为极坐标来做，此时

$$D=\{(r, \theta): 0 \leq r<1\}, \quad C=\{(r, \theta): r=1\}$$

将稳态热传导方程写成极坐标形式得到（我们会在附录中证明它）

$$\Delta u=\frac{\partial^2 u}{\partial r^2}+\frac{1}{r} \frac{\partial u}{\partial r}+\frac{1}{r^2} \frac{\partial^2 u}{\partial \theta^2} = 0$$

以及边界条件 $u(1,\theta) = f(\theta)$.

模仿求解波动方程时的做法，我们分离变量 $u(r, \theta)=F(r) G(\theta)$，得到

$$\frac{r^2 F^{\prime \prime}(r)+r F^{\prime}(r)}{F(r)}=-\frac{G^{\prime \prime}(\theta)}{G(\theta)}=\lambda$$

进一步的可以写成两个常微分方程

$$\left\{\begin{array}{l}
G^{\prime \prime}(\theta)+\lambda G(\theta)=0, \\
r^2 F^{\prime \prime}(r)+r F^{\prime}(r)-\lambda F(r)=0 .
\end{array}\right.$$

由于 $G$ 是一个以 $2\pi$ 为周期的函数，必须有 $\lambda \geq 0$，否则的话 $G$ 就成了一个单调函数，不可能是周期函数。

第一个常微分方程是我们的老熟人了，设 $\lambda = m^{2},m\in\mathbb{Z}$，则方程的解为

$$G(\theta)=\tilde{A} \cos m \theta+\tilde{B} \sin m \theta = A e^{i m \theta}+B e^{-i m \theta}$$

在附录中我们会证明第二个常微分方程的解为

$$F(r) = F(r)= \begin{cases}\alpha r^m+\beta r^{-m}, & m \neq 0 \\ \alpha \log r+\beta, & m=0\end{cases}$$

- 当 $m\neq 0$ 时，$r^{-m}$ 项在 $r\rightarrow 0$ 时无界，因此 $\beta = 0$，此时不妨取 $\alpha = 1$.
- 当 $m = 0$ 时，$\log r$ 项在 $r\rightarrow 0$ 时无界，因此 $\alpha = 0$，此时 $F(r)$ 恒为常数，这不是我们想要的东西。

因此结合两个方程的解，我们可以得到稳态热传导方程的一个特解

$$u_m(r, \theta)=r^{|m|} e^{i m \theta}, \quad m \in \mathbb{Z}$$

由于热传导方程有线性性质，所以我们同样把这些特解叠加起来，得到方程的通解

$$u(r, \theta)=\sum_{m=-\infty}^{\infty} a_m r^{|m|} e^{i m \theta}$$

代入边界条件得到

$$u(1, \theta)=\sum_{m=-\infty}^{\infty} a_m e^{i m \theta}=f(\theta)$$

**现在重点来了，我们知道 $f(\theta)$ 是一个定义在 $[0,2\pi]$ 上的任意函数，且 $f(0)=f(2\pi)$，那么是否意味着所有这样的函数都可以写成这种无穷级数的形式呢？**

**在波动方程求解的过程中，我们也提出了这样的问题，这就是研究傅里叶分析学的起源。**

---

## *Appendix*

> **Theorem 1. Laplacian in Polar Coordinates(极坐标下的拉普拉斯算子).** 拉普拉斯算子
> $$\Delta=\frac{\partial^2}{\partial x^2}+\frac{\partial^2}{\partial y^2}$$ 有极坐标形式
> $$\Delta=\frac{\partial^2}{\partial r^2}+\frac{1}{r} \frac{\partial}{\partial r}+\frac{1}{r^2} \frac{\partial^2}{\partial \theta^2}$$

证明：在极坐标下有坐标转换

$$x  =r \cos \theta, \quad y=r \sin \theta,\quad r^2 =x^2+y^2$$

根据链式法则，有

$$\begin{aligned}
& \frac{\partial}{\partial x}=\frac{\partial r}{\partial x} \frac{\partial}{\partial r}+\frac{\partial \theta}{\partial x} \frac{\partial}{\partial \theta}=\cos \theta \frac{\partial}{\partial r}-\frac{\sin \theta}{r} \frac{\partial}{\partial \theta} \\
& \frac{\partial}{\partial y}=\frac{\partial r}{\partial y} \frac{\partial}{\partial r}+\frac{\partial \theta}{\partial y} \frac{\partial}{\partial \theta}=\sin \theta \frac{\partial}{\partial r}+\frac{\cos \theta}{r} \frac{\partial}{\partial \theta}
\end{aligned}$$

这里我们稍作解释

$$\begin{array}{ll}
\frac{\partial r}{\partial x}=\frac{x}{\sqrt{x^2+y^2}}=\cos \theta, & \frac{\partial r}{\partial y}=\frac{y}{\sqrt{x^2+y^2}}=\sin \theta, \\
\frac{\partial \theta}{\partial x}=-\frac{y}{x^2+y^2}=-\frac{\sin \theta}{r}, & \frac{\partial \theta}{\partial y}=\frac{x}{x^2+y^2}=\frac{\cos \theta}{r} .
\end{array}$$

代入得到

$$\begin{aligned} \Delta
&=\frac{\partial}{\partial x}\left(\frac{\partial}{\partial x}\right)+\frac{\partial}{\partial y}\left(\frac{\partial}{\partial y}\right) \\
& =\cos \theta \frac{\partial}{\partial r}\left(\cos \theta \frac{\partial}{\partial r}-\frac{\sin \theta}{r} \frac{\partial}{\partial \theta}\right)-\frac{\sin \theta}{r} \frac{\partial}{\partial \theta}\left(\cos \theta \frac{\partial}{\partial r}-\frac{\sin \theta}{r} \frac{\partial}{\partial \theta}\right) \\
& \quad\quad +\sin \theta \frac{\partial}{\partial r}\left(\sin \theta \frac{\partial}{\partial r}+\frac{\cos \theta}{r} \frac{\partial}{\partial \theta}\right)+\frac{\cos \theta}{r} \frac{\partial}{\partial \theta}\left(\sin \theta \frac{\partial}{\partial r}+\frac{\cos \theta}{r} \frac{\partial}{\partial \theta}\right) \\
& =\cos \theta\left(\cos \theta \frac{\partial^2}{\partial r^2}+\frac{\sin \theta}{r^2} \frac{\partial}{\partial \theta}-\frac{\sin \theta}{r} \frac{\partial^2}{\partial r \partial \theta}\right) \\
& \quad\quad+\frac{\sin \theta}{r}\left(\sin \theta \frac{\partial}{\partial r}-\cos \theta \frac{\partial^2}{\partial \theta \partial r}+\frac{\cos \theta}{r} \frac{\partial}{\partial \theta}+\frac{\sin \theta}{r} \frac{\partial^2}{\partial \theta^2}\right) \\
& \quad\quad+\sin \theta\left(\sin \theta \frac{\partial^2}{\partial r^2}-\frac{\sin \theta}{r^2} \frac{\partial}{\partial \theta}+\frac{\cos \theta}{r} \frac{\partial^2}{\partial r \partial \theta}\right) \\
& \quad\quad+\frac{\cos \theta}{r}\left(\cos \theta \frac{\partial}{\partial r}+\sin \theta \frac{\partial^2}{\partial \theta \partial r}-\frac{\sin \theta}{r} \frac{\partial}{\partial \theta}+\frac{\cos \theta}{r} \frac{\partial^2}{\partial \theta^2}\right) \\
& =\frac{\partial^2}{\partial r^2}+\frac{1}{r} \frac{\partial}{\partial r}+\frac{1}{r^2} \frac{\partial^2}{\partial \theta^2}
\end{aligned}$$

> **Theorem 2.** 对于 $r>0, n\in \mathbb{Z}$，常微分方程
> $$r^2 F^{\prime \prime}(r)+r F^{\prime}(r)-n^2 F(r)=0$$ 其中 $F(r)$ 二阶可导，则方程的解为 
> $$F(r) = \begin{cases}
\alpha r^{n} + \beta r^{-n}, & n \neq 0 \\
\alpha \log{r}+ \beta , &n=0
\end{cases}$$ 其中 $\alpha,\beta$ 为常数。

证明：设 $F(r) = g(r)r^{n}$，则方程化简为

$$r g^{\prime \prime}(r)+(2 n+1) g^{\prime}(r)=0$$

- 当 $n = 0$ 时

$$r g^{\prime \prime}(r)+g^{\prime}(r) = \left(rg^{\prime}(r)\right)^{\prime} =0$$

因此 $g^{\prime}(r) = \frac{\alpha}{r}$，两边积分得到

$$F(r) = g(r) = \alpha \log r + \beta$$

- 当 $n \neq 0$ 时

$$r g^{\prime \prime}(r)+(2 n+1) g^{\prime}(r) = \left(r g^{\prime}(r) + 2ng(r)\right)^{\prime} = 0$$

因此 $r g^{\prime}(r) + 2ng(r) = \alpha$，分离变量写成微分式

$$\frac{d g}{\alpha-2 n g}=\frac{d r}{r}$$

两边积分得到

$$ 2n\log r + \log(\alpha - 2ng) = \log \beta$$

可以解出

$$g(r) = \frac{\alpha -\beta r^{-2n}}{2n}$$

代回去得到

$$F(r) = \frac{\alpha r^{n} - \beta r^{-n}}{2n}$$

由于 $\alpha,\beta,2n$ 都是常数，因此可以简写为

$$F(r) = \alpha r^{n} + \beta r^{-n}$$



---

## *Reference*

- https://math.stackexchange.com/questions/2226531/how-to-shorten-the-derivation-of-the-laplacian-in-polar-coordinates
- https://www.cfm.brown.edu/people/dobrush/am34/Mathematica/ch6/polar.html
