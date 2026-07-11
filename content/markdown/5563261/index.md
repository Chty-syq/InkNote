---
type: markdown
title: Fourier Analysis Note(3) 傅里叶级数
slug: "5563261"
date: 2024-02-20
updatedAt: 2026-07-11 17:45:31
tags:
  - 傅里叶分析
published: false
category: mathmatics
---

本节我们将正式开启对傅里叶级数的讨论。

---

## *1. Main Definitions*

还记得之前在讨论波动方程和热方程时，我们发现定义在 $[-\pi,\pi]$ 上任意函数 $f(x):\mathbb{R}\rightarrow \mathbb{C}$ 都可以写成

$$F(x)=\sum_{m=0}^{\infty} A_m \cos m x+\sum_{m=1}^{\infty} B_m \sin m x$$

的形式，我们通常把常数项单独拿出来，写成

$$F(x)=A_{0} + \sum_{m=1}^{\infty} A_m \cos m x+\sum_{m=1}^{\infty} B_m \sin m x$$

为了计算各项系数的值，我们需要讨论一波三角函数系的积分问题。

> **Theorem 1.** 三角函数系 $1,\cos x, \cos 2x, \dots, \sin x, \sin 2x, \dots$ 中的任意两个不同函数的乘积在 $[-\pi, \pi]$ 上的积分为 $0$，即三角函数系在区间 $[-\pi, \pi]$ 上正交，且
>
> - 对于 $n,m\in \mathbb{Z}^{+}$
> $$\begin{aligned}
\int_{-\pi}^\pi \sin (m x) \sin (n x) d x&=\pi \delta_{m n}\\
\int_{-\pi}^\pi \cos (m x) \cos (n x) d x&=\pi \delta_{m n}\\
\int_{-\pi}^\pi \sin (m x) \cos (n x) d x&=0
\end{aligned}$$
> - 对于 $m\in\mathbb{Z}^{+}$
> $$\begin{aligned}
& \int_{-\pi}^\pi \sin (m x) d x=0 \\
& \int_{-\pi}^\pi \cos (m x) d x=0
\end{aligned}$$
> 
> 其中 $\delta_{mn}$ 为 *Kronecker delta(克罗内克函数)*
> $$\delta_{mn} = \begin{cases}
0 & \text { for } m \neq n \\ 
1 & \text { for } m=n 
\end{cases}$$

首先我们确定常数项 $A_{0}$，通过两边积分得到

$$\begin{aligned}\int_{-\pi}^\pi F(x) dx
& = 2\pi A_0+\int_{-\pi}^\pi \sum_{m=1}^{\infty}\left\{A_{m} \cos mx+B_{m} \sin mx\right\}dx \\
& = 2\pi A_0+\sum_{m=1}^{\infty}\left\{A_{m} \int_{-\pi}^\pi \cos (mx) dx+B_{m} \int_{-\pi}^\pi\sin (mx) dx\right\} \\
& =2 \pi A_0
\end{aligned}$$

得到

$$A_{0} = \frac{1}{2\pi}\int_{-\pi}^\pi F(x) dx$$

接下来求 $A_{m}$ 的值，我们选择一个 $n >0$，构造一波三角函数系积分

$$\begin{aligned}\int_{-\pi}^\pi F(x) \cos (nx) dx
& = A_0 \int_{-\pi}^\pi \cos (nx) dx +\sum_{m=1}^{\infty}\left\{A_{m} \int_{-\pi}^\pi \cos (mx)\cos(nx) dx+B_{m} \int_{-\pi}^\pi\sin (mx)\cos(nx) dx\right\} \\
& = \pi A_{n}
\end{aligned}$$

得到 $m > 0$ 时的

$$A_{m} = \frac{1}{\pi} \int_{-\pi}^\pi F(x) \cos (mx) dx$$ 

同样的方法可以得到

$$B_{m} = \frac{1}{\pi} \int_{-\pi}^\pi F(x) \sin (mx) dx$$ 

为了保持一致性，我们通常写成

$$F(x)=\frac{A_{0}}{2} + \sum_{m=1}^{\infty} A_m \cos m x+\sum_{m=1}^{\infty} B_m \sin m x$$

这样的话可以把 $A_{0}$ 的表达式融进来。

接下来考虑将区间 $[-\pi, \pi]$ 拓展到 $[-L, L]$ 上，记 $x = \frac{\pi}{L}x^{\prime}$，则

$$F(x^{\prime}) = \frac{A_{0}}{2} + \sum_{m=1}^{\infty} A_m \cos \left(\frac{m\pi x^{\prime}}{L}\right)+\sum_{m=1}^{\infty} B_m \sin\left(\frac{m\pi x^{\prime}}{L}\right)$$

其中

$$\begin{aligned}
& A_{m}=\frac{1}{L} \int_{-L}^L F\left(x^{\prime}\right) \cos \left(\frac{m \pi x^{\prime}}{L}\right) d x^{\prime} \\
& B_{m}=\frac{1}{L} \int_{-L}^L F\left(x^{\prime}\right) \sin \left(\frac{m \pi x^{\prime}}{L}\right) d x^{\prime}
\end{aligned}$$

事实上，我们可以把定义在 $[-L,L]$ 上的 $F(x)$ 拓展为 $\mathbb{R}$ 上的周期函数，这样的话就可以任取区间 $[a,b]$ 得到相应的展开式。

> **Theorem 2. Fourier Series(傅里叶级数).** 若函数 $f(x)$ 是定义在区间 $[a,b]$ 上的可积函数，记 $L=b-a$，则 $f$ 可以展开为傅里叶级数
> $$f(x) = \frac{A_0}{2}+\sum_{m=1}^{\infty} A_m \cos \left(\frac{2m \pi x}{L}\right)+\sum_{m=1}^{\infty} B_m \sin \left(\frac{2m \pi x}{L}\right)$$
> 其中傅里叶系数
> $$\begin{aligned}
& A_{m}=\frac{2}{L} \int_{a}^{b} f(x) \cos \left(\frac{2m \pi x}{L}\right) d x \\
& B_{m}=\frac{2}{L} \int_{a}^{b} f(x) \sin \left(\frac{2m \pi x}{L}\right) d x
\end{aligned}$$

还记得在讲波动方程时，我们使用欧拉公式将定义在 $[-\pi,\pi]$ 上的 $F(x)$ 写成了指数形式

$$F(x)=\sum_{m=-\infty}^{\infty} a_m e^{i m x}$$

其中系数

$$a_m=\left\{\begin{array}{cc}
\frac{1}{2}\left(A_m - i B_m\right), & m>0 \\
\frac{1}{2}\left(A_{-m} + i B_{-m}\right), & m<0 \\
\frac{A_{0}}{2}, & m=0
\end{array}\right.$$

当 $m > 0$ 时，

$$\begin{aligned}a_{m} 
&= \frac{1}{2\pi} \int_{-\pi}^\pi F(x) [\cos m x - i\sin m x] d x  \\
&= \frac{1}{2\pi} \int_{-\pi}^\pi F(x) e^{-imx} d x
\end{aligned}$$

当 $m < 0$ 时，

$$\begin{aligned}a_{m} 
&= \frac{1}{2\pi} \int_{-\pi}^\pi F(x) [\cos (-m x) + i\sin (-m x)] d x  \\
&= \frac{1}{2\pi} \int_{-\pi}^\pi F(x) e^{-imx} d x
\end{aligned}$$

当 $m = 0$ 时，

$$a_{m} = \frac{1}{2 \pi} \int_{-\pi}^\pi F(x) d x$$

把它们整合在一起就是

$$a_{m} = \frac{1}{2\pi} \int_{-\pi}^\pi F(x) e^{-imx} d x$$

按照同样的方法，将区间 $[-\pi,\pi]$ 拓展到 $[a,b]$ 上，得到

> **Theorem 3. Exponential Fourier Series(傅里叶级数的指数形式).** 若函数 $f(x)$ 是定义在区间 $[a,b]$ 上的可积函数，记 $L=b-a$，则 $f$ 可以展开为傅里叶级数
> $$f(x) =\sum_{m=-\infty}^{\infty} a_m e^{\frac{2 \pi i m x}{L}} $$ 其中傅里叶系数
> $$\begin{aligned}
& a_{m} = \frac{1}{L} \int_{a}^{b} f(x) e^{-\frac{2\pi i m x}{L}} d x
\end{aligned}$$

我们看到指数形式的傅里叶级数更加简明一些，在后面的讨论中我们大多都会使用指数形式。

接下来我们来看一些例子。

> **Example 4.** 定义在 $[-\pi, \pi]$ 上的函数 $f(x) = x$，其傅里叶展开式为
> $$f(x) = 2 \sum_{n=1}^{\infty}(-1)^{n+1} \frac{\sin nx}{n}$$

我们按照定义计算系数，当 $n\neq 0$ 时，

$$\begin{aligned}
a_{n} & =\frac{1}{2 \pi} \int_{-\pi}^\pi x e^{-i n x} d x\\
& =\frac{1}{2 \pi}\left[-\frac{x}{i n} e^{-i n x}\right]_{-\pi}^\pi+\frac{1}{2 \pi i n} \int_{-\pi}^\pi e^{-i n x} d x \\
& =\frac{(-1)^{n+1}}{i n}
\end{aligned}$$

这里我们用到了结论 $\sin{n\pi} = 0,\cos{n\pi} = (-1)^{n}$ 得到

$$e^{in\pi} = e^{-in\pi} = (-1)^{n}$$

当 $n = 0$ 时，得到

$$a_{0} = \frac{1}{2 \pi} \int_{-\pi}^\pi x d x = 0$$

因此

$$f(x) = \sum_{n \neq 0} \frac{(-1)^{n+1}}{i n} e^{i n x}=2 \sum_{n=1}^{\infty}(-1)^{n+1} \frac{\sin n x}{n}$$

> **Example 5.** 定义在 $[0, 2\pi]$ 上的函数 $f(x) = \frac{(\pi-x)^{2}}{4}$，其傅里叶展开式为
> $$f(x) = \frac{\pi^2}{12}+\sum_{n=1}^{\infty} \frac{\cos n x}{n^2}$$

同样的方法，当 $n\neq 0$ 时，计算

$$a_{n} = \frac{1}{8 \pi} \int_{0}^{2\pi} (\pi-x)^{2} e^{-i n x} d x = \frac{1}{2n^{2}}$$

当 $n=0$ 时，计算

$$a_{0} = \frac{1}{8 \pi} \int_{0}^{2\pi} (\pi - x)^{2} d x = \frac{\pi^{2}}{12}$$

因此

$$f(x)=\frac{\pi^2}{12}+\sum_{n \neq 0} \frac{1}{2 n^{2}} e^{i n x}=\frac{\pi^2}{12}+\sum_{n=1}^{\infty} \frac{\cos n x}{n^2}$$

> **Example 6.** 定义在 $[0, 2\pi]$ 上的函数 
> $$f(x)=\frac{\pi}{\sin \pi \alpha} e^{i(\pi-x) \alpha}$$ 其中 $\alpha$ 不为整数，则 $f(x)$ 的傅里叶展开式为
> $$f(x) = \sum_{n=-\infty}^{\infty} \frac{e^{i n x}}{n+\alpha}$$

同样的方法，计算

$$\begin{aligned}a_{n} 
&=\frac{1}{2 \sin \pi \alpha} e^{i\pi \alpha} \int_0^{2 \pi}e^{-i (n+\alpha) x} d x \\
&= \frac{e^{i\pi\alpha} - e^{-i\pi\alpha}}{2i(n+\alpha)\sin{\pi\alpha}} \\
&= \frac{1}{n+\alpha}
\end{aligned}$$

事实上，傅里叶级数是 *trigonometric series(三角级数)*

$$\sum_{n=-\infty}^{\infty} a_n e^{\frac{2 \pi i n x }{L}}$$

的一种，若三角级数是有限项的，即对于足够大的 $|n|$ 有 $c_{n}=0$，则我们称之为 *trigonometric polynomial(三角多项式)*，最大的 $|n|$ 称为它的 *degree(阶数)*.

> **Definition 7. N-th Partial Sum(N阶部分和).** 对于傅里叶级数
> $$f(x)=\sum_{n=-\infty}^{\infty} a_n e^{\frac{2 \pi i n x}{L}}$$ 定义其 $N$ 阶部分和为三角多项式
> $$S_N(f)(x)=\sum_{n=-N}^N a_{n} e^{\frac{2 \pi i n x}{L} }$$

这里我们要提出一个问题，**当 $n\rightarrow \infty$ 时，$S_N(f)(x)$ 是否收敛于 $f$**，我们之后会研究这个收敛性的问题。

> **Definition 8. Dirichlet Kernel(狄利克雷核).** 定义在 $x\in [-\pi,\pi]$ 上的三角多项式
> $$D_N(x)=\sum_{n=-N}^N e^{i n x}$$ 称为 $N$ 阶狄利克雷核，其封闭形式为
> $$D_N(x)=\frac{\sin \left(\left(N+\frac{1}{2}\right) x\right)}{\sin(\frac{x}{2})} .$$

我们定义的狄利克雷核实际上就是 $[-\pi,\pi]$ 区间上的傅里叶级数取 $a_{n}=1$ 时的部分和，它在后面的章节中会有重要作用。

记 $\omega=e^{i x}$，则根据等比数列求和得到

$$D_N(x) = \frac{1-\omega^{2N+1}}{1-\omega}\cdot\omega^{-N} = \frac{\omega^{-N}-\omega^{N+1}}{1-\omega}$$

注意到对于任意的 $\lambda$ 有

$$\omega^{\lambda} - \omega^{-\lambda} = 2i \sin(\lambda x)$$

因此我们可以继续化简

$$D_N(x) = \frac{\omega^{-N-\frac{1}{2}}-\omega^{N+\frac{1}{2}}}{\omega^{-\frac{1}{2}}-\omega^{\frac{1}{2}}}=\frac{\sin \left(\left(N+\frac{1}{2}\right) x\right)}{\sin (\frac{x}{2})}$$

> **Definition 9. Poisson Kernel(泊松核).** 定义在 $\theta \in [-\pi,\pi]$ 上的绝对一致收敛级数
> $$P_r(\theta)=\sum_{n=-\infty}^{\infty} r^{|n|} e^{i n \theta}$$ 称为泊松核，其中参数 $r\in [0,1)$，其封闭形式为
> $$P_r(\theta)=\frac{1-r^2}{1-2 r \cos \theta+r^2}$$

这个式子各位读者应该是不陌生的，我们在推导圆盘上的热传导方程时，就得到过这个结果。

记 $\omega=r e^{i \theta}$，那么

$$\begin{aligned}P_r(\theta)
&=\sum_{n=0}^{\infty} \omega^n+\sum_{n=1}^{\infty} \bar{\omega}^n =\frac{1}{1-\omega} + \frac{\bar{\omega}}{ 1 - \bar{\omega}} \\
&= \frac{1-|\omega|^2}{1- (\omega + \bar{\omega})+|\omega|^2 } \\
&= \frac{1-r^2}{1-2 r \cos \theta+r^2}
\end{aligned}$$

泊松核在之后讲傅里叶级数的阿贝尔求和时，将会发挥它的重要作用。

---

## *2. Uniqueness of Fourier Series(傅里叶级数的唯一性)*
