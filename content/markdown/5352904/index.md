---
type: markdown
title: Fourier Analysis Note(1) 弦振动方程
slug: "5352904"
date: 2024-01-22
updatedAt: 2026-07-11 17:26:38
tags:
  - 傅里叶分析
published: true
category: mathmatics
---

傅里叶分析源自于对 *vibrating string(弦振动)* 和 *heat flow(热流)* 问题的研究，这两个物理问题分别导出了 *wave equations(波动方程)* 和 *heat equations(热方程)*，数学家们使用 *Fourier series(傅里叶级数)* 来求解这两个偏微分方程，由此引发了对傅里叶分析学的研究。

因此，我们首先需要讲解弦振动问题和热流问题，推导出波动方程和热方程，从而深刻认识傅里叶分析学的研究背景，本文将介绍弦振动问题。

---

## *1. Simple Harmonic Motion(简谐运动)*

> **Problem 1. Mass Spring System(弹簧质点系统).** 如图所示
> <center><img src="/content-images/external/8d4dfa3ec4a26f59ea7e4d3910324dca.png" width=90%></center>
> 位于光滑水平表面上的质点 $m$ 在弹簧的弹力作用下做简谐运动，记其 $t$ 时刻的位移为 $y(t)$，弹簧的弹性系数为 $k$，则 $y(t)$ 满足微分方程
> $$y^{\prime \prime}(t)+c^2 y(t)=0$$ 其中 $c=\sqrt{k / m}$，$y^{\prime\prime}(t)$ 表示二阶导数。

根据 *Hooke’s law(胡克定律)* 和 *Newton’s law(牛顿定律)* 有

$$-k y(t)=m y^{\prime \prime}(t)$$

记 $c=\sqrt{k / m}$ 即可得到

$$y^{\prime \prime}(t)+c^2 y(t)=0$$ 

在附录中，我们会证明该微分方程的解为

$$y(t)=a \cos c t+b \sin c t$$

其中常数 $a,b$ 的值由初始条件 $y(0),y^{\prime}(0)$ 决定，代入得到

$$y(t)=y(0) \cos c t+\frac{y^{\prime}(0)}{c} \sin c t$$

---

## *2. Standing and Traveling Waves(驻波与行波)*

接下来我们要介绍两种波，如图所示

<center><img src="/content-images/external/93a77743fec53e96ade6730e1b0a08da.gif" width=90%></center>

红色的波是 *standing waves(驻波)*，我们可以发现这种波仅在竖直方向上移动，而在水平方向上没有移动，且波上存在一些始终不动的点。

我们记 $u(x,t)$ 表示 $t$ 时刻的波形图，初始 $t=0$ 时刻的波形图为 $\varphi(x)=u(x,0)$，如下图所示

<center><img src="/content-images/external/42217b9362d57072d3a0faf5c135ad26.png" width=60%></center>

我们发现驻波的本质是波上的每个点在竖直方向上做简谐运动，且该简谐运动的振幅受时间 $t$ 的影响，因此

$$u(x, t)=\varphi(x) \psi(t)$$

而蓝色和绿色的波是 *traveling waves(行波)*，且它们分别向左边和右边运动，记 $t=0$ 时刻的波形图为 $F(x)=u(x,0)$，那么向左移动和向右移动的波函数分别为

$$u(x,t) = F(x + ct),\quad u(x,t) =F(x-ct)$$

---

## *3. Derivation of the Wave Equation(波动方程的推导)*

> **Problem 2. Vibrating String(弦振动).** 如图所示
> <center><img src="/content-images/external/f23fa05ebf8ab2ccc96fa076d9d0534b.png" width=70%></center>
> 一根长度为 $L$ 的质量均匀的弦位于 $xoy$ 平面上，且处于振动状态，设弦的线密度为 $\rho$，我们的目标是求出其波形图 $y=u(x,t)$ 所满足的微分方程。

首先我们把弦均匀划分为 $N$ 段，其中第 $n$ 段弦的位置为 $x_{n} = n\frac{L}{N}$.

每一段弦都可以视为一个质点，那么我们的弦振动模型就可以看成 $N$ 个质点组成的复杂系统，其中每个质点仅在竖直方向振动。

与简谐运动不同的是，每个质点的运动都与其相邻两个质点的瞬时状态有关，如图所示

<center><img src="/content-images/external/d3b4a0649f6e5e0d0a4d8d37662231bd.png" width=65%></center>

设 $y_{n}(t) = u(x_{n},t)$ 表示质点 $x_{n}$ 运动的波形图，且相邻质点的间距记为 $h = \frac{L}{N}$，那么每个质点的质量都是 $\rho h$.

接下来我们对质点 $x_{n}$ 做一波受力分析，其邻居 $x_{n-1},x_{n+1}$ 对 $x_{n}$ 有一个沿弦方向的拉力，以 $x_{n+1}$ 为例，它所施加的拉力大小与 $\frac{y_{n+1}-y_{n}}{h}$ 成正比，不妨设该比值为 $\tau$，则拉力

$$F = \frac{\tau}{h}(y_{n+1}-y_{n})$$

现在完成了受力分析，根据 *Newton’s law(牛顿定律)* 有

$$\begin{aligned}\rho h y_n^{\prime \prime}(t)
&= \frac{\tau}{h}\left\{y_{n+1}(t)+y_{n-1}(t)-2 y_n(t)\right\} \\
&= \frac{\tau}{h}\left\{u\left(x_n+h, t\right)+u\left(x_n-h, t\right)-2 u\left(x_n, t\right)\right\}
\end{aligned}$$

在附录中，我们将证明对于任意二阶连续可导的函数 $f(x)$，有

$$\lim_{h\rightarrow 0}\frac{f(x+h)+f(x-h)-2 f(x)}{h^2} = f^{\prime \prime}(x)$$

因此上面的受力方程可以化简为

$$\rho \frac{\partial^2 u}{\partial t^2}=\tau \frac{\partial^2 u}{\partial x^2}\Rightarrow \frac{1}{c^2} \frac{\partial^2 u}{\partial t^2}=\frac{\partial^2 u}{\partial x^2}$$

这就是我们熟知的 *one-dimensional wave equation(一维波动方程)*，其中系数 $c=\sqrt{\tau / \rho}$ 称为 *velocity of the motion(波动速度)*.

为了求解这个偏微分方程，我们需要对它做一些 *scaling(放缩)*.

对于缩放系数 $a$，设新的 $x$ 坐标 $X = \frac{1}{a}x$，那么弦长 $L$ 变成了 $\frac{L}{a}$，设 $U(X, T)=u(x, t)$，那么有

$$\frac{\partial U}{\partial X}=a \frac{\partial u}{\partial x}, \quad \frac{\partial^2 U}{\partial X^2}=a^2 \frac{\partial^2 u}{\partial x^2}$$

类似的，我们也可以缩放时间 $T=\frac{1}{b}t$，使得波动方程变为

$$\frac{\partial^2 U}{\partial T^2}=\frac{\partial^2 U}{\partial X^2}$$

这样的话，我们就通过缩放去掉了 $c$ 有关的项，求解会方便很多。另一方面，我们也可以通过缩放来限制 $x$ 的范围，例如通过设置缩放系数

$$a = \frac{L}{\pi}, \quad b= \frac{L}{c\pi} $$

可以在消掉 $c$ 的同时，设置 $X$ 的取值范围为 $[0,\pi]$.

---

## *4. Solution by Traveling Waves(波动方程的行波解)*

现在我们来求解波动方程

$$\frac{\partial^2 u}{\partial t^2}=\frac{\partial^2 u}{\partial x^2}$$

首先根据偏微分算子的性质，可将方程改写为

$$\left(\frac{\partial}{\partial t}+\frac{\partial}{\partial x}\right)\left(\frac{\partial}{\partial t}-\frac{\partial}{\partial x}\right) u=0$$

令 $\xi=x-t, \eta=x+t$，得到

$$\frac{\partial}{\partial x}=\frac{\partial}{\partial \xi}+\frac{\partial}{\partial \eta}, \quad \frac{\partial}{\partial t}=- \frac{\partial}{\partial \xi}+ \frac{\partial}{\partial \eta}$$

因此 

$$\frac{\partial^2 u}{\partial \xi \partial \eta}=0$$

那么我们就可以得到波动方程的通解形式

$$u(x,t)=f(\xi)+g(\eta)=f(x-t)+g(x+t)$$

而具体的 $f,g$ 则需要由初始条件来确定。

> **Problem 3. Unbounded String(无限长的弦).** 设振动弦无限长，即 $x\in(-\infty, \infty)$，且给定初始位置 $F(x)$ 及初始速度 $G(x)$，求波动方程的定解，即
> $$\frac{\partial^2 u}{\partial t^2}=\frac{\partial^2 u}{\partial x^2}$$ 初始条件:
> $$u(x,0) = F(x),\quad \frac{\partial u}{\partial t}(x,0) = G(x)$$

我们现在要根据初始条件确定通解中的 $f,g$ 函数，根据初始条件，有

$$\begin{aligned}
f(x)+g(x) &=F(x) \\
f^{\prime}(x)-g^{\prime}(x) &= -G(x)
\end{aligned}$$

将第二个式子两边做积分得到

$$f(x)-g(x)=- \int_0^x G(\xi) \mathrm{d} \xi+C,$$

与第一个式子联立得到

$$\begin{aligned}
& f(x)=\frac{1}{2} F(x)-\frac{1}{2} \int_0^x G(\xi) \mathrm{d} \xi+\frac{C}{2} \\
& g(x)=\frac{1}{2} F(x)+\frac{1}{2} \int_0^x G(\xi) \mathrm{d} \xi-\frac{C}{2}
\end{aligned}$$

因此

$$\begin{aligned}
u(x, t) & =f(x-t)+g(x+t) \\
& =\frac{1}{2}[F(x- t) + F(x+ t)]+\frac{1}{2} \int_{x- t}^{x+ t} G(\xi) \mathrm{d} \xi
\end{aligned}$$

这个解就是著名的 *d’Alembert* 公式，它具有清楚的物理意义

- 第一项表示由初始位置激发的行波，$t=0$ 时的波形为 $F(x)$，之后分成相等的两部分，独立地向左向右传播。
- 第二项表示由初始速度激发的行波，在 $t$ 时刻左右对称地扩展到 $[x − at, x + at]$ 的范围。

---

## *5. Solution by Standing Waves(波动方程的驻波解)*

> **Problem 3. Bounded String(有限长的弦).** 设振动弦的长度为 $L = \pi$，即 $x\in[0,\pi]$，且给定初始位置 $F(x)$ 及初始速度 $G(x)$，求波动方程的定解，即
> $$\frac{\partial^2 u}{\partial t^2}=\frac{\partial^2 u}{\partial x^2}$$ 初始条件：对于 $x\in[0,\pi]$，有
> $$u(x,0) = F(x),\quad \frac{\partial u}{\partial t}(x,0) = G(x)$$ 边界条件：对于 $t>0$， 有
> $$u(0,t) = 0,\quad u(\pi, t) = 0$$

在有边界条件的情况下，我们就不能简单地模仿之前的行波形式的通解，给出函数 $f,g$ 的形式，我们选择使用分离变量的方法先求出方程的一个特解，然后根据特解去找通解。

不妨设 $u(x,t) = \varphi(x) \psi(t)$，这样的话就能把变量 $x,t$ 分开处理，将波动方程写成

$$\varphi(x) \psi^{\prime \prime}(t)=\varphi^{\prime \prime}(x) \psi(t) \Rightarrow \frac{\psi^{\prime \prime}(t)}{\psi(t)}=\frac{\varphi^{\prime \prime}(x)}{\varphi(x)} = \lambda$$

其中 $\lambda$ 为常数，这样的话就得到了两组常微分方程

$$\left\{\begin{array}{l}
\psi^{\prime \prime}(t)-\lambda \psi(t)=0 \\
\varphi^{\prime \prime}(x)-\lambda \varphi(x)=0
\end{array}\right.$$

我们发现它和 *problem 1* 中简谐运动的微分方程长的一模一样，这里我们仅考虑 $\lambda < 0$ 的情况，因为当 $\lambda \geq 0$ 时弦的位移方向与加速度方向相同，这是不可能的。

不妨设 $\lambda = - m^{2}$，那么方程的解为

$$\left\{\begin{array}{l}
\psi(t)=A \cos m t+B \sin m t \\
\varphi(x)=\tilde{A} \cos m x+\tilde{B} \sin m x
\end{array}\right.
$$

其中常数 $A,B,\tilde{A},\tilde{B},m$ 的值由初始条件和边界条件决定，由于对于任意的 $t>0$ 有

$$u(0,t) = \varphi(0)\psi(t) = 0$$

而 $\psi(t)$ 不能恒等于 $0$，因此 $ \varphi(0) = 0$，同样的有 $\varphi(\pi) = 0$，因此

$$\tilde{A}=0, \quad \tilde{B} \sin m \pi = 0$$

我们是不希望 $\tilde{B} = 0$ 的，因为这样的话我们只能得到 $\varphi(x)$ 恒等于 $0$ 的结果，这显然不是我们想要的，这样的话只能 $m \in \mathbb{Z}$.

而 $m \neq 0$，否则又回到了 $\varphi(x)$ 恒等于 $0$，不妨设 $m\geq 1$，则每一个 $m$ 对应了一组常数 $A_{m},B_{m}$ 的值，我们就得到了波动方程的一组特解

$$u(x,t) = \left(A_m \cos m t+B_m \sin m t\right) \sin m x$$

这里我们直接取了 $\tilde{B} = 1$，这是因为取其它的 $\tilde{B}$ 得到的解都是线性相关的，接下来我们会说明这一点。

假设 $u_{1},u_{2}$ 都是波动方程的解，那么

$$\frac{\partial^2}{\partial x^2}(\alpha u_{1}+\beta u_{2}) = \alpha \frac{\partial^2 u_{1}}{\partial x^2} + \beta\frac{\partial^2 u_{2}}{\partial x^2} = \frac{\partial^2}{\partial t^2}(\alpha u_{1}+\beta u_{2})$$

我们发现 $u_{1},u_{2}$ 的任意线性组合 $\alpha u_{1}+\beta u_{2}$ 都是波动方程的解。

因此我们将之前求出的特解叠加起来，就得到了波动方程的通解

$$u(x, t)=\sum_{m=1}^{\infty}\left(A_m \cos m t+B_m \sin m t\right) \sin m x$$

其中常数 $A_{m},B_{m}$ 的值由初始条件决定，我们将 $u(x, 0)=F(x)$ 代入得到

$$F(x) = \sum_{m=1}^{\infty} A_m \sin m x$$

**本文中最为精妙的地方出现了，我们知道 $F(x)$ 表示弦的初始位置，它是一个任意的连续可导函数。**

**而现在我们需要根据 $F(x)$ 求常数 $A_{m}$ 的值，这是否意味着任意的 $F(x)$ 都可以写成上面的三角函数无穷叠加的形式呢？**

**这就是研究傅里叶分析学的起源，在接下来的章节中，我们将逐步解答这个问题。**

事实上，我们计算函数 $F(x) \sin n x$ 在 $[0,\pi]$ 上的积分可以发现

$$\begin{aligned}
\int_0^\pi F(x) \sin n x d x & =\int_0^\pi\left(\sum_{m=1}^{\infty} A_m \sin m x\right) \sin n x d x \\
& =\sum_{m=1}^{\infty} A_m \int_0^\pi \sin m x \sin n x d x=A_n \cdot \frac{\pi}{2}
\end{aligned}$$

这里我们用到了下面的结论，我们将在附录中证明它，

$$\int_0^\pi \sin m x \sin n x d x= \begin{cases}0 & \text { if } m \neq n \\ \pi / 2 & \text { if } m=n\end{cases}$$

这里我们直接交换积分与求和号是有问题的，因为我们现在还不能保证这个无穷级数收敛，在后面的章节中我们会证明这一点，先暂时忽略它。

这样的话，我们就得到了常数

$$A_n=\frac{2}{\pi} \int_0^\pi F(x) \sin n x d x$$

现在我们知道了定义在 $[0,\pi]$ 上的函数 $F(x)$ 可以写成一系列 $\sin$ 函数的无穷级数的形式，那么如果我们把 $F(x)$ 拓展为 $[-\pi,\pi]$ 上的奇函数，这个结论也是成立的。

据此我们可以合理猜测一波，对于 $[-\pi,\pi]$ 上的偶函数 $G(x)$，它可以写成一系列 $\cos$ 函数的无穷级数的形式

$$G(x)=\sum_{m=0}^{\infty} A_m^{\prime} \cos m x$$

现在我们把这两者结合起来，合理猜测对于 $[-\pi,\pi]$ 上的任意函数 $H(x)$，它可以写成

$$H(x)=\sum_{m=1}^{\infty} A_m \sin m x+\sum_{m=0}^{\infty} A_m^{\prime} \cos m x$$

**值得注意的是 $\cos$ 项的系数是从 $m=0$ 开始累加的，这是因为奇函数满足 $f(0)=0$，所以不含常数项，而偶函数则不然。**

使用 *Euler’s identity(欧拉恒等式)* $e^{i x}=\cos x+i \sin x$，我们可以得到

$$\left\{\begin{array}{l}
e^{imx} = \cos{mx} + i\sin{mx} \\
e^{-imx} = \cos{mx} - i\sin{mx}
\end{array}\right. \Rightarrow
\left\{\begin{array}{l}
\cos{mx} = \frac{1}{2} (e^{imx} + e^{-imx}) \\
\sin{mx} = \frac{1}{2i} (e^{imx} - e^{-imx})
\end{array}\right.$$

这样我们就能将 $H(x)$ 写成指数形式

$$\begin{aligned} H(x)
&= \sum_{m=1}^{\infty} \left\{ \frac{A^{\prime}_{m} - iA_{m}}{2} e^{imx} + \frac{A^{\prime}_{m} + iA_{m}}{2} e^{-imx} \right\} \\
&= \sum_{m=-\infty}^{\infty} a_m e^{i m x} 
\end{aligned}$$

其中

$$a_m=\left\{\begin{array}{c}
\frac{1}{2}(A_m^{\prime}-i A_m), &\quad m > 0 \\
\frac{1}{2}(A_{-m}^{\prime}+i A_{-m}), &\quad m < 0 \\
0, &\quad m = 0
\end{array}\right.$$

最后我们以一个例子作为波动方程的结尾。

---

## *6. Example: The Plucked String(被拨动的弦)*

> **Problem 4. Plucked String(被拨动的弦).** 设振动弦的长度为 $\pi$，且满足波动方程
> $$\frac{\partial^2 u}{\partial t^2}=\frac{\partial^2 u}{\partial x^2}$$ 在初始时刻，该弦在 $x=p$ 处被人为的拨动至高度 $h$ 处，且 $p\in(0,\pi)$，如图所示
> <center><img src="/content-images/external/4831a9b0251397dfa7b8ef37733c2a80.png" width=50%></center>
> 根据弦的初始位置示意图，可以写出波动方程的初始条件：对于 $x\in[0,\pi]$，有
> $$u(x,0) = F(x) = \begin{cases}\frac{x h}{p}, & \text { for } 0 \leq x \leq p \\ \frac{h(\pi-x)}{\pi-p}, & \text { for } p \leq x \leq \pi\end{cases}$$ $$\frac{\partial u}{\partial t}(x,0) = 0$$ 以及边界条件：对于 $t>0$， 有
> $$u(0,t) = 0,\quad u(\pi, t) = 0$$

根据之前讨论的结果，可以将初始位置函数写成

$$F(x)=\sum_{m=1}^{\infty} A_m \sin m x \quad \text { with } \quad A_m=\frac{2 h}{m^2} \frac{\sin m p}{p(\pi-p)}$$

由于初始速度为 $0$，波动方程通解表达式中所有的 $B_{m}$ 都是 $0$，因此波动方程为

$$u(x, t)=\sum_{m=1}^{\infty} A_m \cos m t \sin m x$$

这里我们根据积化和差公式，可以将波动方程写为

$$u(x, t)=\frac{f(x+t)+f(x-t)}{2}$$

的形式，也就是说，我们得到了行波形式的解。

事实上，所有驻波形式的解通过这样的数理变换都可以对应到行波形式的解。

---

## *Appendix*

> **Theorem 1.** 若函数 $f$ 是 $\mathbb{R}$ 上的二阶连续可微函数，且是微分方程
> $$y^{\prime \prime}(t)+c^2 y(t)=0$$ 的解，那么必定存在常数 $a,b$ 使得
> $$f(t)=a \cos c t+b \sin c t$$
 
证明：考虑函数

$$\begin{aligned}
g(t)&=f(t) \cos c t-c^{-1} f^{\prime}(t) \sin c t \\
h(t)&=f(t) \sin c t+c^{-1} f^{\prime}(t) \cos c t
\end{aligned}$$

求导发现 $g^{\prime}(t)\equiv 0, h^{\prime}(t)\equiv 0$，设 $g(t)=a,h(t)=b$，则

$$\begin{aligned}
f(t) \cos^{2} c t-c^{-1} f^{\prime}(t) \sin c t\cos ct &= a\cos{ct}\\
f(t) \sin^{2} c t+c^{-1} f^{\prime}(t) \sin c t\cos c t &= b\sin{ct}
\end{aligned}$$

相加即可得到

$$f(t)=a \cos c t+b \sin c t$$

> **Theorem 2.** 设 $F$ 是定义在区间 $(a,b)$ 上的二阶连续可导函数，则
> $$\lim_{h\rightarrow 0}\frac{F(x+h)+F(x-h)-2 F(x)}{h^2} = F^{\prime \prime}(x)$$

证明：我们只需将 $F(x+h),F(x-h)$ 进行二阶泰勒展开得到

$$\begin{aligned}
F(x+h)&=F(x)+h F^{\prime}(x)+\frac{h^2}{2} F^{\prime \prime}(x)+h^2 \varphi(h)\\
F(x-h)&=F(x)-h F^{\prime}(x)+\frac{h^2}{2} F^{\prime \prime}(x)+h^2 \psi(h)
\end{aligned}$$

其中 $\varphi(h),\psi(h)$ 为二阶无穷小量，因此

$$\lim _{h \rightarrow 0} \frac{F(x+h)+F(x-h)-2 F(x)}{h^2} = F^{\prime \prime}(x) + \lim _{h \rightarrow 0} (\varphi(h)+\psi(h)) =  F^{\prime \prime}(x) $$

> **Theorem 3.** 对于任意的 $m,n\in \mathbb{Z}^{+}$，有
> $$\int_0^\pi \sin m x \sin n x d x= \begin{cases}0 & \text { if } m \neq n \\ \pi / 2 & \text { if } m=n\end{cases}$$

证明：当 $m\neq n$ 时，

$$\begin{aligned}
\int_{0}^\pi \sin m x \sin n x d x & =-\frac{1}{2} \int_{0}^\pi[\cos (m+n) x-\cos (m-n) x] d x \\
& =-\left.\frac{1}{2}\left[\frac{1}{m+n} \sin (m+n) x-\frac{1}{m-n} \sin (m-n)x\right]\right|_{0} ^\pi =0
\end{aligned}$$

当 $m = n$ 时，

$$\begin{aligned}
\int_{0}^\pi \sin m x \sin n x d x & =-\frac{1}{2} \int_{0}^\pi\left[\cos 2 m x-1\right] d x \\
& =-\left.\frac{1}{2}\left[\frac{1}{2 m} \sin 2mx-x\right]\right|_{0} ^\pi = \frac{\pi}{2}
\end{aligned}$$

---

## *Reference*

- http://msvlab.hre.ntou.edu.tw/grades/PDE(2008)/%E5%81%8F%E5%BE%AE%E5%88%86%E6%96%B9%E7%A8%8B_%E4%B8%80%E7%B6%AD%E5%BD%88%E6%80%A7%E6%B3%A2.pdf
- https://www.jiaxuanli.me/Docs/Mathematical_Method/chpp14.pdf
