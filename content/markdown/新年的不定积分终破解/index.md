---
type: markdown
title: 新年的不定积分
slug: 8043157
date: 2026-06-15
updatedAt: 2026-06-16 21:41:10
tags:
  - 微积分
published: true
category: mathmatics
---

## 1. Problem Description

时隔多年终于又回想起了 **JJchen** 老师留下的新年积分

$$\int \frac{4035(4\sin x\cos x+2x+3+x^2)}{(2016\cos x+2017\sin x+2018x\cos x+2019x\sin x)^2}dx$$

这个问题难度略大，**JJchen** 老师给出了以下提示，我们需要依次破解

$(1)\int \frac{\cos^2{x}}{(\cos{x}+x\sin{x})^2}dx=\frac{\sin{x}}{\cos{x}+x\sin{x}}+C$

$(2)\int \frac{x^2}{(\cos{x}+x\sin{x})^2}dx=\frac{\sin{x}-x\cos{x}}{\cos{x}+x\sin{x}}+C$

$(3)\int \frac{(1-x^4)\sin{2x}+2x\cos{2x}}{(\cos^2{x}+x^2\sin^2{x})^2}dx=\frac{\sin^2{x}+x^2\cos^2{x}}{\cos^2{x}+x^2\sin^2{x}}+C$

$(4)\int \frac{-3(x^6+1)\sin^2{x}\cos^2{x}+3x^2(1-3\sin^2{x}\cos^2{x})}{(\cos^3{x}+x^3\sin^3{x})^2}dx=\frac{x^3\cos^3{x}-\sin^3{x}}{\cos^3{x}+x^3\sin^3{x}}+C$

$(5)\int \frac{x^2+2x+3+4\sin{x}\cos{x}}{(\cos{x}+2\sin{x}+3x\cos{x}+4x\sin{x})^2}dx=\frac{(x-1)\sin{x}-2\cos{x}}{(12x+6)\sin{x}+(9x+3)\cos{x}}+C$

---

## 2. Solved (1),(2) by Prof.JJhen

前两个积分的破解方法 **JJchen** 老师已经给出：

$(1)$ 注意到 $d(\frac{1}{\cos{x}+x\sin{x}})=-\frac{x\cos{x}}{(\cos{x}+x\sin{x})^2}dx$，构造一波得到

$$\begin{aligned}\int \frac{\cos^2{x}}{(\cos{x}+x\sin{x})^2}dx&=\int \frac{\cos{x}(\cos{x}+x\sin{x})-x\cos{x}\sin{x}}{(\cos{x}+x\sin{x})^2}dx\\&=\int \frac{\cos{x}}{(\cos{x}+x\sin{x})}dx-\int \frac{x\sin{x}\cos{x}}{(\cos{x}+x\sin{x})^2}dx\\&=\int \frac{\cos{x}}{(\cos{x}+x\sin{x})}dx+\int \sin{x}d\left(\frac{1}{\cos{x}+x\sin{x}}\right)\\&=\int \frac{\cos{x}}{(\cos{x}+x\sin{x})}dx+\frac{\sin{x}}{\sin{x}+\cos{x}}-\int \frac{\cos{x}}{(\cos{x}+x\sin{x})}dx\\&=\frac{\sin{x}}{\sin{x}+\cos{x}}+C\end{aligned}$$

---

$(2)$ 我们同样构造与 $x\cos{x}$ 有关的项得到

$$\begin{aligned}\int \frac{x^2}{(\cos{x}+x\sin{x})^2}dx&=\int \frac{x^2\cos^2{x}}{(\cos{x}+x\sin{x})^2}dx+\int \frac{x^2\sin^2{x}}{(\cos{x}+x\sin{x})^2}dx\\&=-\int x\cos{x}d\left(\frac{1}{\cos{x}+x\sin{x}}\right)+\int \frac{x^2\sin^2{x}}{(\cos{x}+x\sin{x})^2}dx\\&=-\frac{x\cos{x}}{\cos{x}+x\sin{x}}+\int \frac{\cos{x}-x\sin{x}}{\cos{x}+x\sin{x}}\frac{x^2\sin^2{x}}{(\cos{x}+x\sin{x})^2}dx\\&=-\frac{x\cos{x}}{\cos{x}+x\sin{x}}+\int\frac{\cos^2{x}}{(\cos{x}+x\sin{x})^2}dx\\&=-\frac{x\cos{x}}{\cos{x}+x\sin{x}}+\frac{\sin{x}}{\sin{x}+\cos{x}}+C\end{aligned}$$

---

## 3. Solved (3) by Construction(构造)

看到这里方法已经很明显了，我们求出分母的微分，然后想办法构造分子，利用分部积分把后面的积分抵消掉，照此思路，当时的我独立破解了

$(3)$ 注意到 $d(\frac{1}{\cos^2{x}+x^2\sin^2{x}})=\frac{2(1-x^2)\sin{x}\cos{x}-2x\sin^2{x}}{(\cos^2{x}+x^2\sin^2{x})^2}$，构造相关项得到

$$\begin{aligned}\int \frac{(1-x^4)\sin{2x}+2x\cos{2x}}{(\cos^2{x}+x^2\sin^2{x})^2}dx&=\int\frac{2(1-x^2)(1+x^2)\sin{x}\cos{x}+2x-4x\sin^2{x}}{(\cos^2{x}+x^2\sin^2{x})^2}dx\\&=\int\frac{(1+x^2)[2(1-x^2)\sin{x}\cos{x}-2x\sin^2{x}]}{(\cos^2{x}+x^2\sin^2{x})^2}dx+\int\frac{2x(x^2\sin^2{x}+\cos^2{x})}{(\cos^2{x}+x^2\sin^2{x})^2}dx\\&=\int (1+x^2)d\left(\frac{1}{\cos^2{x}+x^2\sin^2{x}}\right)+\int\frac{2x(x^2\sin^2{x}+\cos^2{x})}{(\cos^2{x}+x^2\sin^2{x})^2}dx\\&=\frac{1+x^2}{\cos^2{x}+x^2\sin^2{x}}-\int\frac{2x(x^2\sin^2{x}+\cos^2{x})}{(\cos^2{x}+x^2\sin^2{x})^2}dx+\int\frac{2x(x^2\sin^2{x}+\cos^2{x})}{(\cos^2{x}+x^2\sin^2{x})^2}dx\\&=\frac{1+x^2}{\cos^2{x}+x^2\sin^2{x}}+C\end{aligned}$$

注意到 $\frac{1+x^2}{\cos^2{x}+x^2\sin^2{x}}-1=\frac{\sin^2{x}+x^2\cos^2{x}}{\cos^2{x}+x^2\sin^2{x}}$，所以该解与题中解等价

然而 $(4)(5)$ 的破解博主当时没能完成，前些天睡觉时突然想起来这回事，如今的我有强大的AI辅助，破解它们想必不在话下

~~然后他喵的 *ChatGPT* 告诉我只需要求右边的微分就能证明了~~

---

## 4. Solved (4),(5) by Substitution(换元)

$(4)$ 式越来越复杂了，为了不被三角函数迷晕，我们引入 $\tan x$ 进行简化，根据万能公式处理分母

$$\begin{aligned}\left(\cos ^3 x+x^3 \sin ^3 x\right)^2
&= \frac{(\cos^{6}x+x^{3}\sin^{3}x\cos^{3}x)^2}{\cos^{6}x}\\
&= \frac{(1+x^{3}\tan^{3}x)^{2}}{(1+\tan^{2}x)^{6}\cos^{6}{x}}
=\frac{\left(1+x^3 \tan^{3}{x}\right)^2}{\left(1+\tan^{2}x\right)^3}\end{aligned}$$

整理一下积分式得到

$$\begin{aligned}I
&=3 \int \frac{x^2-\left(x^6+1+3 x^2\right) \sin ^2 x \cos ^2 x}{\left(\cos ^3 x+x^3 \sin ^3 x\right)^2} d x \\
&= 3 \int \frac{x^2\left(1+\tan ^2 x\right)^3-\left(x^6+3 x^2+1\right)(1+\tan^{2}x) \tan^{2}x}{\left(1+x^3 \tan ^3 x\right)^2} d x \\
&= 3 \int \frac{x^2\left(1+\tan^6 x\right)-\tan^2 x\left(1+\tan^2 x\right)\left(1+x^6\right)}{\left(1+x^3 \tan ^3 x\right)^2} d x
\end{aligned}$$

最后一步变换我们需要稍作解释

$$x^2\left(1+\tan ^2 x\right)^3 = x^2(1+\tan ^6) + 3x^2 \tan^{2}x(1+\tan^{2} x)$$

右边那一项刚好可以和减去的项合并，就能完成变换了，接下来是重头戏换元魔法，令 $u = x^{3}, v = \tan^{3}{x}$，其微分

$$du = 3x^{2}dx, \quad dv = 3\tan^2{x}(1+\tan^{2}x)dx$$

代入积分式得到

$$I = \int \frac{(1+v^2)du - (1+u^2)dv}{(1+uv)^2} = \frac{u-v}{1+uv} + C= \frac{x^3-\tan ^3 x}{1+x^3 \tan ^3 x}+C$$

这与题中的解等价，看完魔法目瞪口呆

---

$(5)$ 式看上去更加吓人，我们引入 $\tan x$ 进行换元，根据万能公式处理分母

$$\begin{aligned}(\cos x+2 \sin x+3 x \cos x+4 x \sin x)^2 
&= \cos^{2}x \left[(3x+1) + (4x+2)\tan{x}\right]^2 \\
&= \frac{\left[(3x+1) + (4x+2)\tan{x}\right]^2}{1+\tan^{2}x}
\end{aligned}$$

整理积分式得到 
$$\begin{aligned}I&=\int \frac{[(x+1)^2+2](1+\tan^2{x})+4\tan{x}}{\left[(3x+1) + (4x+2)\tan{x}\right]^2} dx\\
&= \int \frac{(x+1)^2(1+\tan^2{x})+2(1+\tan{x})^2}{\left[(3x+1) + (4x+2)\tan{x}\right]^2} dx\\
&= \int \frac{(x+1)^2d(\tan{x})+2(1+\tan{x})^2dx}{\left[(3x+1) + (4x+2)\tan{x}\right]^2} \\
&= \int \frac{(x+1)^2d(\tan{x})+2(1+\tan{x})^2dx}{\left[(x+1)(3+4\tan{x}) -2 (1+\tan{x})\right]^2}
\end{aligned}$$

其中最后一步变换的目的是让积分式中出现 $x+1$ 和 $1+\tan{x}$ 这样的形式，看起来非常对称，方便我们下一步的换元，令 $u = \frac{3+4\tan{x}}{1+\tan{x}}$，其微分

$$du = \frac{d(\tan{x})}{(1+\tan{x})^{2}}$$

因此积分式

$$\begin{aligned}I = \int \frac{(x+1)^2 (1+\tan{x})^2du+2(1+\tan{x})^2dx}{\left[u(x+1)(1+\tan{x}) -2 (1+\tan{x})\right]^2} =\int \frac{(x+1)^2 du+2dx}{\left[(x+1)u -2 \right]^2}
\end{aligned}$$

神奇的换元魔法，我们得到了相当对称的形式，观察分母的微分

$$d\left(\frac{1}{(x+1) u-2}\right) = -\frac{(x+1)du+udx}{[(x+1) u-2]^2}$$

我们构造一下得到

$$\begin{aligned}I &= \int \frac{(x+1)^2 du+u(x+1)dx - [u(x+1)-2]dx}{\left[(x+1)u -2 \right]^2} \\
&=- \int (x+1)d\left(\frac{1}{(x+1) u-2}\right) - \int \frac{dx}{(x+1)u-2} \\
&= -\frac{x+1}{(x+1)u-2} + \int \frac{d x}{(x+1) u-2} - \int \frac{d x}{(x+1) u-2} \\
&= -\frac{x+1}{(x+1)u-2}
\end{aligned}$$

还是熟悉的分部积分消掉无法计算的项，将 $u$ 代入回去就可以得到

$$I =-\frac{(x+1)(\cos x+\sin x)}{(3 x+1) \cos x+(4 x+2) \sin x}+C $$

这似乎和题目中的结果不太一样，我们做一下减法发现

$$\frac{(x-1) \sin x-2 \cos x}{(12 x+6) \sin x+(9 x+3) \cos x} + \frac{(x+1)(\cos x+\sin x)}{(3 x+1) \cos x+(4 x+2) \sin x} = \frac{1}{3}$$

只差一个常数，所以等价是没有问题的。

---

## 5. Solved Final Boss

终于轮到最后的 BOSS 了，我们发现它和 $(5)$ 式的形式一模一样，就是换了几个数字，我们还是用 $t=\tan{x}$ 写成较为对称的形式

$$I=4035 \int \frac{(x+1)^2 dt+2(1+t)^2 d x}{[(2018 x+2016)+(2019 x+2017) t]^2} = 4035 \int \frac{(x+1)^2 d t+2(1+t)^2 d x}{[(x+1)(2018+2019 t)-2(1+t)]^2}$$

仅有两项 $1+t$ 和 $2018+2019t$ 与三角函数相关，然后魔法换元 $u=\frac{2018+2019 t}{1+t}$，这个换元的巧妙之处在于，分子两组系数只相差 $1$，所以

$$d u=\frac{2019(1+t)-(2018+2019 t)}{(1+t)^2} d t = \frac{d t}{(1+t)^2}$$

然后就可以把积分写成

$$\begin{aligned}I=4035 \int \frac{(x+1)^2(1+t)^2 d u+2(1+t)^2 d x}{[(x+1)(1+t)u-2(1+t)]^2}
=4035 \int \frac{(x+1)^2 d u+2 d x}{[(x+1) u-2]^2}
\end{aligned}$$

这个 $(5)$ 式换元的结果一模一样，因此

$$I = -\frac{4035(x+1)}{(x+1) u-2} = -\frac{4035(x+1)(\sin x+\cos x)}{2016 \cos x+2017 \sin x+2018 x \cos x+2019 x \sin x}+C$$

可以仿照 $(5)$ 式调整一下常熟写成更好看的形式

$$I = -\frac{2016x\sin{x} + 2017x\cos{x} + 2018\sin{x} + 2019\cos{x}  }{2016 \cos x+2017 \sin x+2018 x \cos x+2019 x \sin x}+C$$ 

---

## Appendix: Substitution by $\tan{x}$

很多读者想必已经忘记了高中学过的 $\tan{x}$ 换元技巧，这里帮助大家复习一下，我们熟知万能公式

$$\sin x=\frac{2 t}{1+t^2}, \quad \cos x=\frac{1-t^2}{1+t^2},\quad \tan x=\frac{2 t}{1-t^2}$$

其中 $t=\tan{\frac{x}{2}}$，因此

$$\cos^{2}x = \frac{\cos{2x}+1}{2} = \frac{1}{1+\tan^{2}x}$$

$$\sin^{2}x = 1 - \cos^{2}x = \frac{\tan^{2}x}{1+\tan^{2}x}$$

$$\sin{x}\cos{x} = \frac{\sin{2x}}{2} = \frac{\tan{x}}{1+\tan^{2}x}$$

利用这个技巧可以将高次的三角函数统一成 $\tan x$ 的形式，而

$$d(\tan x) = (1+\tan^{2}x) dx$$

可以将分母 $1+\tan^{2}x$ 进行积分换元
