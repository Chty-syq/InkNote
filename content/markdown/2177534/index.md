---
type: markdown
title: Solid Angle
slug: 2177534
date: 2023-09-01
updatedAt: 2026-06-23 14:15:11
tags:
  - 基础数学
published: true
category: mathmatics
---

## *1. Introduction*

我们在初中阶段就熟知平面角的定义，如图所示

<center>![](/content-images/external/22d3c9e951249bbb523c9244a12158fa.jpg)</center>

直线 $OA, OB$ 相交于点 $O$，组成了一个平面角 $\theta$，其单位为弧度，定义整个圆周对应的平面角为 $2\pi$，则圆弧 $AB$ 所对应的 $\theta$ 为

$$\theta = \frac{l}{r}$$

如果不是圆弧，而是一段任意的平面曲线 $f(x,y) = 0$呢？

对于熟知微积分的读者来说，这很简单，我们只需要把 $\theta$ 进行微分，每个微元仍是一段圆弧，然后积起来就行了

$$\theta = \int_{L} \frac{dl_{\perp}}{r}$$

其中 $dl_{\perp}$ 表示把一段微元投影到所在圆弧上。 

类似的，我们在三维空间中可以定义 *solid angle(立体角)*，如图所示

<center>![enter image description here](/content-images/external/81177b66a04ba712d5ea3f3733c13174.jpg)</center>

一段闭合曲面 $S$ 投影于以 $O$ 为球心的单位球上，组成了一个空间立体角 $\omega$，其单位为 *sr(球面度)*，其大小定义为投影曲面 $S_{\perp}$ 的面积除以单位球半径的平方

$$\omega = \frac{S_{\perp}}{r^{2}}$$

我们知道完整球面的面积为 $4\pi r^{2}$，其对应的立体角即为 $4\pi$，这就是我们常在摄像头广告上看到其宣称 $720$ 度无死角的原因。

对于任意的曲面 $S$，我们也可以写成积分式

$$\omega = \iint_S \frac{dS_{\perp}}{||\vec{r}||^2}$$

其中 $dS_{\perp}$ 表示微元在对应球面上的投影面积，$\vec{r}$ 表示微元指向点 $O$ 的径向向量。

我们也可以用球面参数 $\theta,\phi$ 表示，如图所示

<center>![enter image description here](/content-images/external/d0d7379fb75fb0d3b609de0cf3966d40.png)</center>

球面上的一段微元面积 $dS$ 受到 $d\theta, d\phi$ 的影响，其面积的变化量等于经向与纬向的弧长变化量 $dl_{\theta}, dl_{\phi}$ 的乘积，即

$$dS = dl_{\theta}dl_{\phi} = r_{\theta} d\theta \cdot r_{\phi} d\phi = r^{2} \sin{\theta}  d\theta d\phi$$

因此有

$$\omega = \iint_S \sin{\theta}  d\theta d\phi$$

---

## *2. An Example of Cone(圆锥的例子)*

> **Example 1. Cone(圆锥).** 如图所示
> <center>![enter image description here](/content-images/external/d71c01e2cad879115d5b791f7ef494a9.png)</center>
> 一个半径为 $r$ 的圆锥，其半锥角为 $\theta$，证明圆锥底面对应的立体角为
> $$\omega = 2 \pi(1-\cos \theta)$$

**Method 1(投影法)** 

根据定义我们直接把圆锥底面投影到对应的球面上，我们知道球冠的面积公式为

$$S = 2\pi rh$$

根据 $\cos\theta = \frac{r-h}{r}$，可以得到 $h = r(1-\cos\theta)$，因此

$$\omega = \frac{2\pi h}{r} = 2\pi(1-\cos\theta)$$

**Method 2(微元法)**

我们直接计算积分式

$$\omega=\iint_S \frac{d S_{\perp}}{||\vec{r}||^2}$$

我们以圆锥底面圆心 $O$ 为原点建立坐标系，考虑一段微元 $dS$，其法向量为 $z$ 轴方向 $\vec{e_{z}}$，投影方向为径向向量 $\vec{r}$，因此微元在球面上的投影为

$$dS_{\perp} = \vec{e_{z}}\cdot \frac{\vec{r}}{||\vec{r}||} dS = \frac{r-h}{||\vec{r}||}dS$$

设微元的所在位置为 $(x,y)$，则 $\vec{r} = (x,y,r-h)$，因此

$$\omega=(r-h)\iint_S \frac{d S}{||\vec{r}||^3} = (r-h)\iint_S \frac{d xdy}{\left(x^{2}+y^{2}+(r-h)^{2}\right)^{\frac{3}{2}}}$$

现在我们把问题转化为了一个二重积分，对其进行极坐标变换

$$\left\{\begin{array}{l}
x=\rho \cos \phi \\
y=\rho \sin \phi
\end{array}\right., \quad\rho\in[0,R], \phi\in[0, 2\pi]$$

其中 $R$ 表示圆锥底面的半径（圆锥底面是一个圆面），代入得到

$$\begin{aligned}\omega
&= (r-h)\int_{0}^{2\pi}d\phi \int_{0}^{R} \frac{\rho d\rho}{\left(\rho^2+(r-h)^2\right)^{\frac{3}{2}}}\\
&= \pi(r-h) \int_{0}^{R^{2}} \frac{d\rho}{\left(\rho+(r-h)^2\right)^{\frac{3}{2}}} \\
&= \pi(r-h) \int_{(r-h)^{2}}^{R^{2}+(r-h)^{2}} \rho^{-\frac{3}{2}}d\rho \\
&= 2\pi(r-h) \left( \frac{1}{r-h} - \frac{1}{\sqrt{R^{2}+(r-h)^{2}}} \right) \\
&= 2\pi (1 - \frac{r-h}{\sqrt{R^{2}+(r-h)^{2}}}) \\
&= 2\pi (1 - \cos\theta)
\end{aligned}$$

**Method 3(球坐标法)**

我们计算球坐标形式的积分

$$\omega=\iint_S \sin \theta^{'} d \theta^{'} d \phi$$

在这里，$\phi\in[0,2\pi], \theta^{'}\in [0,\theta]$，因此

$$\omega=\int_0^{2 \pi} d \phi \int_0^\theta \sin \theta^{\prime} d \theta^{\prime} = 2\pi(1-\cos\theta)$$

---

## *Reference*

- [https://www.bilibili.com/video/BV1Us4y1c79N](https://www.bilibili.com/video/BV1Us4y1c79N)
- [https://spie.org/publications/fg11_p02_solid_angle?SSO=1](https://spie.org/publications/fg11_p02_solid_angle?SSO=1)
- [https://en.wikipedia.org/wiki/Solid_angle](https://en.wikipedia.org/wiki/Solid_angle)
