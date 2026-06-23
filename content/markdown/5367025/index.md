---
type: markdown
title: 3D Rotations with Quaternion
slug: 5367025
date: 2023-11-27
updatedAt: 2026-06-23 14:02:59
tags:
  - 计算机图形学
  - 基础数学
published: true
category: mathmatics
---

书接上文，本篇将介绍三维旋转的最后一部分，著名的 *Quaternion(四元数)*.

虽然网上有很多相关的资料，但它们大多用非常代数的方法来讲述四元数的很多深奥性质，却没有解释清楚它与旋转之间的关系，有种差强人意的感觉。

因此，本篇希望仅讲述四元数的一些简单性质，而将重点放在与旋转的关联与测地插值上，从而展现四元数的精妙之处。

在此之前，我们先来回顾一下复数与二维旋转之间的联系。

--- 

## *1. Complex Number Review*

对于两个复数 $z_{1} = a_{1} + b_{1} i, z_{2} =a_{2} + b_{2} i $，我们熟知复数乘法

$$z_{1}z_{2} = a_{1}a_{2} - b_{1}b_{2} + (a_{1}b_{2} + a_{2}b_{1})i = \begin{equation}
\left[\begin{array}{cc}
a_{1} & -b_{1} \\
b_1 & a_1
\end{array}\right]\left[\begin{array}{l}
a_2 \\
b_2
\end{array}\right]
\end{equation}$$

其中右侧的 $\begin{equation}
\left[\begin{array}{l}
a_2 \\
b_2
\end{array}\right]
\end{equation}$ 是向量形式的 $z_{2}$，而左侧的 $\begin{equation}
\left[\begin{array}{cc}
a_1 & -b_1 \\
b_1 & a_1
\end{array}\right]
\end{equation}$ 实际上是 $z_{1}$ 的矩阵形式，也就是说复数相乘的操作，本质上是对右边的复数进行了一次变换。

如果我们把这两个复数都写成矩阵的形式，那么

$$\begin{equation}
z_1 z_2=\left[\begin{array}{cc}
a_1 & -b_1 \\
b_1 & a_1
\end{array}\right]\left[\begin{array}{cc}
a_2 & -b_2 \\
b_2 & a_2
\end{array}\right] =
\left[\begin{array}{cc}
a_1 a_2-b_1 b_2 & -(b_1 a_2+a_1 b_2) \\
b_1 a_2+a_1 b_2 & a_1 a_2-b_1 b_2
\end{array}\right] = z_{2}z_{1}
\end{equation}$$

我们发现复数的乘法等价于两个变换的合成，且满足交换律。对于比较特殊的复数，其矩阵形式

$$\begin{equation}
1=\left[\begin{array}{ll}
1 & 0 \\
0 & 1
\end{array}\right]=I,\quad
i=\left[\begin{array}{cc}
0 & -1 \\
1 & 0
\end{array}\right]
\end{equation}$$

可以看到单位实数 $1$ 在复数域上等价于单位阵，而虚数单位的平方

$$\begin{equation}
i^2=i \cdot i=\left[\begin{array}{cc}
0 & -1 \\
1 & 0
\end{array}\right]\left[\begin{array}{cc}
0 & -1 \\
1 & 0
\end{array}\right]=\left[\begin{array}{cc}
-1 & 0 \\
0 & -1
\end{array}\right]=-I=-1
\end{equation}$$

在复数域上与 $-I$ 等价，这进一步展示了复数与矩阵形式的关联。

我们知道一个二维矩阵可以表示二维空间上的一个空间变换，那么复数的矩阵形式所表示的变换到底是什么呢？

除了常见的 $z=a+bi$，我们还可以用三角函数来表示一个复数

$$z = r(\cos\theta + i \sin\theta)$$

其中 $\theta=\begin{equation}
\operatorname{atan2} (b, a)
\end{equation}$ 表示幅角，$r=\begin{equation}
\sqrt{a^2+b^2}
\end{equation}$ 表示模长，那么我们的矩阵形式就可以写成

$$z = \begin{equation}
\left[\begin{array}{cc}
a & -b \\
b & a
\end{array}\right]=\sqrt{a^2+b^2}\left[\begin{array}{cc}
\frac{a}{\sqrt{a^2+b^2}} & \frac{-b}{\sqrt{a^2+b^2}} \\
\frac{b}{\sqrt{a^2+b^2}} & \frac{a}{\sqrt{a^2+b^2}}
\end{array}\right] =
r\left[\begin{array}{cc}
\cos (\theta) & -\sin (\theta) \\
\sin (\theta) & \cos (\theta)
\end{array}\right]
\end{equation}$$

这不就是一个旋转矩阵吗！

我们看到复数的相乘实际上就是旋转与缩放的复合，对于一个复数 $z_{2}$，我们给它乘上 $z_{1}$，相当于将 $z_{1}$ 逆时针旋转 $\theta_{2}$，然后将它的模长缩放 $r_{2}$ 倍。 

我们知道二维旋转的合成等价于旋转角相加，且没有顺序的要求，而矩阵形式复数的乘法满足交换律，两者是一致的。

---

## *2. Definitions of Quaternion*

现在我们终于可以开始讨论四元数了，四元数的定义与复数类似，区别在于其定义在四维空间上，拥有一个实轴和三个虚轴 $i,j,k$，四元数 $q\in \mathbb{H}$ 可以写成

$$q = a + bi + cj + dk$$

其中虚轴满足如下的运算约定

$$\begin{equation}
i^2=j^2=k^2=i j k=-1
\end{equation}$$

这里我们必须稍作解释，回想复数虚轴的平方 $i^{2}$，它代表的是将实数 $1$ 连续两次逆时针旋转 $90^{\circ}$，最终得到 $-1$，因此四元数的虚轴 $i,j,k$ 也要满足这样的性质。

而 $ijk=-1$ 的约定则是与右手系的旋转有关，想象一下在右手系的三维坐标系 $(i,j,k)$ 中先将 $k$ 轴绕 $j$ 旋转 $90^{\circ}$，它刚好与 $i$ 轴重合，之后又乘上一个 $i$，因此结果为 $-1$.

我们可以把四元数写成向量的形式 $[a,b,c,d]^{T}$，另外，我们也经常将实轴与虚轴分开，写成 $[s,\mathbf{v}]$ 的有序数对的形式。

> **Definition 1. Norm.** 对于四元数 $q=a+bi+cj+dk$，定义其模长为
> $$\|q\|=\sqrt{a^2+b^2+c^2+d^2} = \sqrt{s^2+\|\mathbf{v}\|^2}$$

<div></div>

> **Definition 2. Addition.** 对于两四元数 $q_{1},q_{2}$，它们加减法的定义与复数相同，即
> $$q_{1} + q_{2} = (a_{1}+a_{2}) + (b_{1}+b_{2})i + (c_{1}+c_2) j + (d_{1}+d_{2})k$$ $$q_{1} - q_{2} = (a_{1}-a_{2}) + (b_{1}-b_{2})i + (c_{1}-c_2) j + (d_{1}-d_{2})k$$

<div></div>

> **Definition 3. Multiply.** 对于两四元数 $q_{1},q_{2}$，它们的乘法定义为
> $$q_{1}q_{2} = \begin{aligned}
& (a_{1} a_2-b_{1} b_2-c_1 c_2-d_1 d_2)+ \\
& (b_{1} a_2+a_{1} b_2-d_1 c_2+c_1 d_2) i+ \\
& (c_{1} a_2+d_{1} b_2+a_1 c_2-b_1 d_2) j+ \\
& (d_{1} a_2-c_{1} b_2+b_1 c_2+a_1 d_2) k
\end{aligned} = \left[\begin{array}{cccc}
a_1 & -b_1 & -c_1 & -d_1 \\
b_1 & a_1 & -d_1 & c_1 \\
c_1 & d_1 & a_1 & -b_1 \\
d_1 & -c_1 & b_1 & a_1
\end{array}\right]\left[\begin{array}{l}
a_2 \\
b_2 \\
c_2 \\
d_2
\end{array}\right]$$

这里我们根据 $ijk=-1$ 的约定，可以得到如下的计算表

<center><img src="/content-images/external/b8a211722d04b903d501cd2c7aa03b0c.png" ></center>

从上表中可以看出，虚部的乘法不满足交换律，即 $ij=-k$，而 $ji=k$，因此四元数的乘法不满足交换律。

根据这个计算表，进行展开就能得到上面的结果了，我们发现四元数可以写成矩阵的形式，这个矩阵表示四维空间下的变换。

> **Definition 4. Graßmann Product.** 对于两个四元数 $q_{1}=[s_{1},\mathbf{v}_{1}],q_{2}=[s_{2},\mathbf{v}_{2}]$，它们相乘的结果为
> $$q_1 q_2=[s_{1} s_{2}-\mathbf{v_{1}} \mathbf{v_{2}}, s_{1} \mathbf{v_{2}}+s_{2} \mathbf{v}_{1}+\mathbf{v}_{1} \times \mathbf{v}_{2}]$$ 我们把这种形式的乘法称为 *Graßmann product(格拉斯曼积)*.

我们稍作推导，记 $\mathbf{v}_{1} = [b_{1},c_{1},d_{1}]^{T}, \mathbf{v}_{2}=[b_{2},c_{2},d_{2}]^{T}$，则

$$\mathbf{v}_{1} \mathbf{v}_{2} = b_1b_2 + c_1c_2 + d_1d_2$$

$$\mathbf{v}_{1} \times \mathbf{v}_{2} = \left|\begin{array}{lll}
\mathbf{i} & \mathbf{j} & \mathbf{k} \\
b_1 & c_1 & d_1 \\
b_2 & c_2 & d_2
\end{array}\right| = (c_1d_2 - c_2d_1)i - (b_1d_2 - b_2d_1)j + (b_1c_2-b_2c_1)k$$

我们只需要将 $q_{1}q_{2}$ 表达式中的项稍作整理，就能得到 *Graßmann product* 的式子。这个式子非常重要，后面我们要靠它与旋转进行联系。

> **Definition 5. Pure Quaternion.** 如果一个四元数的实部为 $0$，即 $$v=[0, \mathbf{v}]$$ 我们把这样的四元数称为 *pure quaternion(纯四元数)*，两个纯四元数 $v=[0,\mathbf{v}],u=[0,\mathbf{u}]$ 的乘积 $$vu = [-\mathbf{v} \cdot \mathbf{u}, \mathbf{v} \times \mathbf{u}]$$

<div></div>

> **Definition 6. Conjugate.** 定义四元数 $q=a+b i+c j+d k$ 的 *conjugate(共轭)* 为 
> $$q^*=a-b i-c j-d k$$ 如果用有序数对表示的话就是 $q^*=[s,-\mathbf{v}]$，共轭具有一个非常好的性质
> $$\begin{aligned}
q q^* & =[s, \mathbf{v}] \cdot[s,-\mathbf{v}] \\
& =\left[s^2-\mathbf{v} \cdot(-\mathbf{v}), s(-\mathbf{v})+s \mathbf{v}+\mathbf{v} \times(-\mathbf{v})\right] \\
& =\left[s^2+\mathbf{v} \cdot \mathbf{v}, \mathbf{0}\right] \\
& = \|q\|^{2} = q^{*}q
\end{aligned}$$

<div></div>

> **Definition 7. Inverse.** 定义四元数 $q$ 的 *inverse(逆)* $q^{-1}$ 满足 
> $$q q^{-1}=q^{-1} q=1$$ 根据共轭的性质，我们发现 
> $$q^{-1}=\frac{q^*}{\|q\|^2}$$ 对于模长为 $1$ 的 *unit quaternion(单位四元数)*，有 $q^{-1}= q^{*}$.

---

## *3. The Relation between Rotation and Quaternion*

回顾我们之前讲轴角旋转时，推导过的罗德里格斯旋转公式，它描述了向量 $p$ 绕轴 $a$ 旋转 $\theta$ 角后的向量坐标

$$p^{\prime}=p \cos \theta+\sin \theta(a \times p)+(1-\cos \theta)(a \cdot p) a$$

我们沿用之前推导它时的思路，将 $p$ 分解为垂于和平行于轴 $a$ 的 $p_{\perp}, p_{\|}$，首先来看垂直部分的

$$p_{\perp}^{\prime}=\sin \theta(a \times p)+\cos \theta p_{\perp}$$

还记得纯四元数的乘法有 $v u=[-\mathbf{v} \cdot \mathbf{u}, \mathbf{v} \times \mathbf{u}]$ 的形式，因此我们构造纯四元数 $u = [0, a], v_{\perp} = [0, p_{\perp}]$，则 

$$uv_{\perp} = [-a\cdot p_{\perp}, a\times p_{\perp}] = [0, a\times p_{\perp}]$$

记旋转后的纯四元数为 $v^{\prime}_{\perp} = [0, p_{\perp}^{\prime}]$，根据四元数的运算规则有

$$v^{\prime}_{\perp} = uv_{\perp} \sin\theta + v_{\perp} \cos\theta = (u\sin\theta + \cos\theta) v_{\perp}$$

这里我们用到了 $a\times p = a\times p_{\perp}$，如果你在图上稍微画一下，那么这个等式是显而易见的，我们记四元数

$$q = \cos (\theta)+u\sin (\theta)  = [\cos (\theta), a\sin (\theta)]$$

我们发现使用四元数 $q$ 可以把向量 $p_{\perp}$ 旋转为 $p^{\prime}_{\perp}$，且 $\|q\| = 1$.

> **Theorem 8.** 给定垂直于旋转轴 $a$ 的向量 $p_{\perp}$ 和旋转角 $\theta$，使用四元数
> $$q = [\cos \theta, a\sin \theta]$$ 可以计算旋转后的向量，计算方法为取纯四元数 $v_{\perp} = [0, p_{\perp}]$，然后计算四元数乘法
> $$v^{\prime}_{\perp} = q v_{\perp}$$ 得到表示旋转后向量的纯四元数 $v^{\prime}_{\perp} = [0, p^{\prime}_{\perp}]$，取其虚部就是所求的 $p^{\prime}_{\perp}$.

接下来我们讨论平行的部分，我们知道旋转操作不会对 $p_{\|}$ 产生影响，因此 $p^{\prime}_{\|} = p_{\|}$，记纯四元数 

$$v_{\|} = [0, p_{\|}], \quad v^{\prime} = [0, p^{\prime}]$$

那么结合上面垂直部分的结果可以得到

$$ v^{\prime} = v_{\|} + q v_{\perp}$$

其实这个式子已经可以用于计算了，但实际上它可以继续化简得到更为精妙的结果，为此我们需要证明一些引理。

> **Lemma 9.** 若四元数 $q=[\cos \theta, a \sin \theta]$，其中 $a$ 为单位向量，则
> $$q^{2} = [\cos 2\theta, a \sin 2\theta]$$

这个引理的证明是简单的，只需要直接展开 *Graßmann* 积就行了

$$\begin{aligned}q^2 
&= [\cos \theta, a \sin \theta] \cdot [\cos \theta, a \sin \theta] \\
&= \left[\cos^{2} \theta - \|a\|^{2}\sin^{2}\theta, 2a \sin \theta\cos\theta + \sin^{2}\theta (a\times a)\right] \\
&= \left[\cos^{2} \theta - \sin^{2}\theta, 2a \sin \theta\cos\theta \right] \\
&= [\cos 2\theta, a \sin 2\theta]
\end{aligned}$$

这个引理的几何意义是，如果绕同一个轴 $a$ 连续两次旋转 $\theta$，那么等价于绕 $a$ 直接旋转 $2\theta$，这与我们的认知是一致的。

有了这个引理，我们就可以引入四元数 $r = \left[ \cos\frac{\theta}{2}, a \sin\frac{\theta}{2} \right]$ 使得 $r^{2} = q$，从而继续化简式子

$$\begin{aligned} v^{\prime} 
&= v_{\|} + q v_{\perp} \\
&= rr^{-1}v_{\|} + rr v_{\perp}\\
&= rr^{*}v_{\|} + rr v_{\perp} 
\end{aligned}$$

> **Lemma 10.** 对于纯四元数 $v = [0, p]$ 和四元数 $q = [\alpha,\beta a]$，其中 $a$ 为单位向量，$\alpha,\beta\in\mathbb{R}$
>
> - (1) 若 $p \mid\mid a$，则 $qv = vq$
> - (2) 若 $p \perp a$，则 $qv = vq^{*}$

先证明 (1)，若 $q \mid\mid v$，注意到根据 *Graßmann* 积展开后

$$qv = [-\beta a\cdot p, \alpha p + \beta (a\times p )]$$

$$vq = [-\beta a\cdot p, \alpha p + \beta (p\times a )]$$

唯一不同的地方在于 $a\times p$ 和 $p\times a$ 的顺序，因此只需要证明它们相等就行了，由于平行关系的存在，显然

$$p\times a = 0 = a \times p$$

后证明 (2)，若 $p \perp a$，同样根据 *Graßmann* 积进行展开

$$qv = [-\beta a\cdot p, \alpha p + \beta (a\times p )]$$

$$vq^{*} = [\beta a\cdot p, \alpha p - \beta (p\times a )]$$

首先看实部，由于垂直关系，$a\cdot p = 0$，因此实部相等，而虚部中根据叉积的性质

$$a\times p = -p\times a$$

因此虚部也相等，证明完毕。

有了这个强力的引理，我们就可以继续进行化简了

$$\begin{aligned} v^{\prime} 
&= rr^{*}v_{\|} + rr v_{\perp} \\
&= rv_{\|}r^{*} + rv_{\perp}r^{*}  \\
&= r(v_{\|} + v_{\perp})r^{*} \\
&= rvr^{*}
\end{aligned}$$

大功告成，我们终于得到了最终的四元数旋转公式了！

> **Theorem 11. Quaternion Rotation.** 给定旋转轴 $a$ 和旋转角 $\theta$，对于任意的向量 $p$ ，使用四元数
> $$q = \left[\cos \frac{\theta}{2}, a\sin \frac{\theta}{2}\right]$$ 可以计算旋转后的向量，计算方法为取纯四元数 $v = [0, p]$，然后计算四元数乘法
> $$v^{\prime} = q v q^{*} = q v q^{-1}$$ 得到表示旋转后向量的纯四元数 $v^{\prime} = [0, p^{\prime}]$，取其虚部就是所求的 $p^{\prime}$.

<div></div>

> **Theorem 12. Convert to Axis-Angle.** 给定四元数 $q = [a, b]$，其对应的轴角旋转 $(u, \theta)$ 为
> $$\theta = 2\arccos(a),\quad u = \frac{b}{\sin(\arccos(a))}
$$

四元数向轴角的转化非常显而易见，但是向矩阵的转化则需要一些推导，还记得我们在将四元数乘法定义的时候计算了

$$q_1 q_2=\begin{aligned}
& \left(a_1 a_2-b_1 b_2-c_1 c_2-d_1 d_2\right)+ \\
& \left(b_1 a_2+a_1 b_2-d_1 c_2+c_1 d_2\right) i+ \\
& \left(c_1 a_2+d_1 b_2+a_1 c_2-b_1 d_2\right) j+ \\
& \left(d_1 a_2-c_1 b_2+b_1 c_2+a_1 d_2\right) k
\end{aligned}=\left[\begin{array}{cccc}
a_1 & -b_1 & -c_1 & -d_1 \\
b_1 & a_1 & -d_1 & c_1 \\
c_1 & d_1 & a_1 & -b_1 \\
d_1 & -c_1 & b_1 & a_1
\end{array}\right]\left[\begin{array}{l}
a_2 \\
b_2 \\
c_2 \\
d_2
\end{array}\right] = \left[\begin{array}{cccc}
a_2 & -b_2 & -c_2 & -d_2 \\
b_2 & a_2 & d_2 & -c_2 \\
c_2 & d_2 & a_2 & -b_2 \\
d_2 & c_2 & -b_2 & a_2
\end{array}\right]\left[\begin{array}{l}
a_1 \\
b_1 \\
c_1 \\
d_1
\end{array}\right]$$

也就是说，左乘四元数 $q$ 等价于乘上矩阵

$$L(q) = \left[\begin{array}{cccc}
a & -b & -c & -d \\
b & a & -d & c \\
c & d & a & -b \\
d & -c & b & a
\end{array}\right]$$

而右乘四元数 $q$ 等价于乘上矩阵

$$R(q) = \left[\begin{array}{cccc}
a & -b & -c & -d \\
b & a & d & -c \\
c & -d & a & b \\
d & c & -b & a
\end{array}\right]$$

因此我们的旋转公式 $v^{\prime} = qvq^{*}$ 写成矩阵形式就是

$$v^{\prime}=L(q) R\left(q^*\right) v = \left[\begin{array}{cccc}
1 & 0 & 0 & 0 \\
0 & 1-2 c^2-2 d^2 & 2 b c-2 a d & 2 a c+2 b d \\
0 & 2 b c+2 a d & 1-2 b^2-2 d^2 & 2 c d-2 a b \\
0 & 2 b d-2 a c & 2 a b+2 c d & 1-2 b^2-2 c^2
\end{array}\right] v$$

在计算 $v^{\prime}$ 的时候，我们不关心它的实部，因此矩阵的外圈可以忽略，所以有

> **Theorem 13. Convert to Matrix.** 给定四元数 $q = a + bi + cj+ dk$，其对应的旋转矩阵为
> $$R = \left[\begin{array}{ccc}
1-2 c^2-2 d^2 & 2 b c-2 a d & 2 a c+2 b d \\
2 b c+2 a d & 1-2 b^2-2 d^2 & 2 c d-2 a b \\
2 b d-2 a c & 2 a b+2 c d & 1-2 b^2-2 c^2
\end{array}\right]$$

接下来我们考虑复合旋转的问题，也就是说对于两个四元数 $q_{1}, q_{2}$，先实施 $q_{1}$ 旋转，再实施 $q_{2}$ 旋转，怎么求旋转后的结果呢？

为了解决这个问题，我们需要一个引理

> **Lemma 14.** 对于四元数 $q_{1} = [s_{1}, v_{1}], q_{2} = [s_{2}, v_{2}]$，有
> $$q_{1}^{*}q_{2}^{*} = (q_{2}q_{1})^{*}$$

证明方法也很简单，直接用 *Graßmann* 进行展开就行了

$$q_{1}^{*}q_{2}^{*} = [s_{1} s_{2}-\mathbf{v_{1}} \mathbf{v_{2}}, -s_{1} \mathbf{v_{2}}-s_{2} \mathbf{v}_{1}+\mathbf{v}_{1} \times \mathbf{v}_{2}] = (q_{2}q_{1})^{*}$$

有了这个引理，再加上四元数乘法的结合律，我们的复合旋转就是

$$v^{\prime\prime} = q_{2}q_{1}vq_{1}^* q_{2}^{*} = q_{2}q_{1}v(q_{2} q_{1})^{*}$$

也就是说我们的复合旋转就是 $q_{c} = q_{2}q_{1}$.

> **Theorem 15. Double Cover(双覆盖).** 对任意的单位四元数 $q$，有
> $$(-q) v(-q)^*=(-1)^2 q v q^*=q v q^*$$ 因此 $q$ 与 $-q$ 对应的是同一个旋转，实际上
> $$-q = \left[\cos \left(\pi-\frac{\theta}{2} \right), -a\sin \left(\pi-\frac{\theta}{2} \right)\right]$$ 对应的是以 $-a$ 为轴，旋转角为 $2\pi - \theta$ 的旋转，这两个旋转在几何上也是等价的，可以证明单位四元数与旋转是 *2-1 surjective homomorphism(2-1满射同态)* 的关系，也可以说单位四元数 *double cover(双覆盖)* 了三维旋转 。

这里双覆盖关系的证明需要用到一些李群李代数的知识，留坑待填。

双覆盖问题会对之后要讲的四元数插值带来一些小麻烦。值得一提的是，虽然 $q$ 与 $-q$ 对应了同一个旋转，但它们对应的旋转矩阵是完全相同的，因此旋转矩阵不会出现双覆盖的问题。

---

## *4. Geodesic Interpolation(测地插值)*

对于两个四元数表示的旋转 $q_{0}, q_{1}$，我们希望找到一些中间变换 $q_{t}$ 使得初始位姿 $q_{0}$ 能够平滑过度到 $q_{1}$，其中 $t\in[0,1]$.

我们曾在轴角表示中讨论过这个问题，这里从初始位姿 $q_{0}$ 变换到目标位姿 $q_{1}$，实际上进行的旋转是

$$\Delta q = q_{1}q^{-1}_{0} = q_{1}q_{0}^{*}$$

根据 *Lemma 9* 我们知道只需要取 $(\Delta q)^{t}$ 就能表示 $t$ 分位的旋转量了，因此四元数的插值公式为

$$q_{t} = (q_{1}q_{0}^{*})^{t} q_{0}$$

这个公式虽然可以直接算，但它的计算不仅涉及多个四元数的乘法，而且包含幂运算，在实际应用中的效率很低，我们希望找到更为高效的插值方法。

设 $q_{0}=[\cos\theta_{0}, a_{0}\sin\theta_{0}], q_{1}=[\cos\theta_{1}, a_{1}\sin\theta_{1}]$，那么 $\Delta q$ 的实部

$$\mathbb{R}(\Delta q) = \cos\theta_{0} \cos\theta_{1} + \sin\theta_{0}\sin\theta_{1} a_{0}a_{1} = q_{0} \cdot q_{1}$$

这里我们把 $q_{0}, q_{1}$ 看成四维向量，然后惊喜的发现 $\Delta q$ 的实部就是 $q_{0},q_{1}$ 的点积，因此 $\Delta q$ 对应的

$$\theta = \arccos(q_{0}\cdot q_{1})$$

那么对 $\Delta q$ 的插值实际上就是对它的旋转角 $2\theta$ 进行插值，如图所示

<center><img src="/content-images/external/0b48c96c08754d6ccb65f3b5583d955e.png" height=230px></center>

在左图中我们将两个四元数投影到了一个二维的圆上面，它们的夹角为 $\theta$，对应了右图中向量 $v_{0}$ 绕某个轴旋转 $2\theta$ 到 $v_{1}$ 的过程。

我们有一个非常显然的做法就是把初始向量 $v_{0}$ 和目标向量 $v_{1}$ 进行线性插值得到

$$v_{t} = (1-t)v_{0} + tv_{1}$$

对应左图中的四元数插值 $q_{t} = (1-t)q_{0} + tq_{1}$，这里需要保证插值后仍是一个单位四元数，所以要进行正则化，这就是我们的 *nlerp* 方法。

> **Method 16. Nlerp.** 对于四元数 $q_{0},q_{1}$，定义其 *normalized linear interpolation(正则化线性插值)* 为
> $$q_t=\operatorname{Nlerp}\left(q_0, q_1, t\right)=\frac{(1-t) q_0+t q_1}{\left\|(1-t) q_0+t q_1\right\|}$$

如图所示，*nlerp* 的结果实际上就是沿直线插值，然后将其正则化。

<center><img src="/content-images/external/8106fd4bf8d47940be1470619ceade99.png" height=200px><img src="/content-images/external/3c32cff526e82fb72b318ca895efd887.png" height=200px></center>

但是这样的插值是有问题的，从图中可以看到 $t\in [0, 0.25]$ 的圆弧明显比 $t\in [0.25, 0.5]$ 要短很多，也就是说 $v_{t}$ 扫过的角速度不均匀。

为了修正它，我们需要对夹角 $\theta$ 进行插值，由于 $\Delta q$ 的旋转轴 $u_{t}$ 很难求，不能直接硬算，可先设

$$q_{t} = \alpha q_{0} + \beta q_{1}$$

两边同时点乘 $q_{0}$ 得到

$$\cos (t \theta)=\alpha+\beta \cos (\theta)$$

两边同时点乘 $q_{1}$ 得到

$$\cos ((1-t) \theta)=\alpha \cos (\theta)+\beta$$

两方程联立消掉 $\alpha$ 得到

$$\cos ((1-t) \theta) = \cos (t \theta) \cos (\theta)-\beta \cos ^2(\theta)+\beta$$

利用一些三角恒等式可以解出

$$\begin{aligned}\beta
& =\frac{\cos (\theta-t \theta)-\cos (t \theta) \cos (\theta)}{\sin ^2(\theta)} \\
& =\frac{\cos (\theta) \cos (t \theta)+\sin (\theta) \sin (t \theta)-\cos (t \theta) \cos (\theta)}{\sin ^2(\theta)} \\
& =\frac{\sin (\theta) \sin (t \theta)}{\sin ^2(\theta)} \\
& =\frac{\sin (t \theta)}{\sin (\theta)}
\end{aligned}$$

代回去得到

$$\begin{aligned}
\alpha & =\cos (t \theta)-\left(\frac{\sin (t \theta)}{\sin (\theta)}\right) \cos (\theta) \\
& =\frac{\cos (t \theta) \sin (\theta)-\sin (t \theta) \cos (\theta)}{\sin (\theta)} \\
& =\frac{\sin ((1-t) \theta)}{\sin (\theta)}
\end{aligned}$$

这样的话我们就得到了 *slerp* 插值方法。

> **Method 17. Slerp.** 对于四元数 $q_{0},q_{1}$，定义其 *spherical linear interpolation(球面线性插值)* 为
> $$q_t=\operatorname{Slerp}\left(q_0, q_1, t\right)=\frac{\sin ((1-t) \theta)}{\sin \theta} q_0+\frac{\sin (t \theta)}{\sin \theta} q_1$$ 其中
> $$\theta = \arccos(q_{0}\cdot q_{1})$$

实际上我们的 *slerp* 方法是对向量旋转的夹角进行了插值，它与最开始提到的

$$q_{t} = (q_{1}q_{0}^{*})^{t} q_{0}$$

是等价的，如果利用四元数的指数形式对上式中的幂运算做拆分的话，也能得到相同的结果。

值得一提的是，当夹角 $\theta$ 非常小时，$\sin\theta$ 会引入较大的浮点误差，此时应该使用 *nlerp* 来进行计算。

另外，还记得我们之前讲过的双覆盖问题，$q$ 与 $-q$ 虽然表示同一个旋转，但是它们作为四维向量的夹角相差了 $\pi$ 的弧度，此时如果使用 *slerp* 进行差值的话，实际上会对 $2\pi - \theta$ 的旋转角进行插值，这显然不是测地插值。

因此，我们在使用 *slerp* 时，需要先检查 $\theta$ 是否为钝角，即检查 $q_{0} \cdot q_{1}$ 是否为负，如果

$$q_{0} \cdot q_{1} < 0$$

我们就需要反转其中一个四元数，例如将 $q_{0}$ 变成 $-q_{0}$，从而保证插值是测地的。

---

## *5. Conclusion*

本文首先从代数角度介绍了四元数的基本性质，然后结合轴角旋转公式，推导出四元数与旋转之间的联系，最后讨论了四元数的测地插值。

但是所留的坑远远比所讲到的东西深得多，例如

- 双覆盖的证明
- 指数形式与指数映射
- 二重四元数
- 与 *Clifford* 代数的联系
- 与李群李代数的联系

希望日后可以对这些大坑进行更加深入的研究学习。


---

## *Reference*

- https://krasjet.github.io/quaternion/quaternion.pdf
- http://motion.pratt.duke.edu/RoboticSystems/3DRotations.html#Quaternions
