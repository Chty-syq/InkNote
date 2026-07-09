---
type: markdown
title: Spherical Trigonometry
slug: 5187191
date: 2023-12-22
updatedAt: 2026-06-23 13:10:00
tags:
  - 非欧几何
  - 基础数学
published: true
category: mathmatics
---

最近在使用 *signed distance field(有向距离场)* 求解 *mesh* 碰撞距离时，研究了一下 `libigl` 库的计算方法，发现它求了一个叫做 *winding number(环绕数)* 的东西，它的定义如下

> **Definition 1. Winding Number.** 对于给定的 *3d-mesh* $M = (V,F)$，以及空间内一点 $P\in\mathbb{R}^{3}$，定义 $P$ 点对于该 $M$ 的 *winding number* 为
> $$w(P)=\sum_{f_i \in F} \frac{1}{4 \pi} \Omega_{f_i}(P)$$ 其中 $\Omega_{f_i}(P)$ 表示面片 $f_{i}$ 关于 $P$ 点的立体角，根据 $w(P)$ 的值可以进行如下判断
> 
> - 若 $w(P) = 1$，则点 $P$ 位于 $M$ 内部
> - 若 $w(P) = 0$，则点 $P$ 位于 $M$ 外部

这里就引入了一个问题，那就是如何求一个三角面片 $f_{i}$ 关于空间一点 $P$ 的立体角 $\Omega_{f_i}(P)$ 呢？

为此，我们需要学习一波 *spherical trigonometry(球面三角学)* 的知识。

---

## *1. Introduction(引入)*

我们首先介绍一些有关球面的基本概念，一个通过球心的平面与球面相交得到一个 *great circle(大圆)*，而不通过球心的平面得到的圆一定比大圆小。

通过球面上不在同一直径两端的两点，有且仅有一个大圆。

对于球面上的三点 $A,B,C$，它们两两间所在大圆的圆弧 $AB,AC,BC$ 构成了一个 *spherical triangle(球面三角形)*.

这个三角形的三个角，例如角 $A$，就是圆弧 $AB,AC$ 所在平面组成的二面角。这里的图不太好画(其实是偷懒)，读者可以自行在纸上画一下。

记球心为 $O$，则这两个平面相交于直线 $OA$ 处，我们可以将 $\triangle ABC$ 投影到 $A$ 点所在的切平面上，得到一个平面三角形 $\triangle AB^{\prime}C^{\prime}$，根据切平面的性质有 $AB^{\prime} \perp OA, AC^{\prime}\perp OA$，因此 $\angle B^{\prime}AC^{\prime}$ 就是 $AB,AC$ 所在大圆平面组成的二面角。

通过这种投影到切平面的方法，我们可以用平面角直观的表示出球面三角形的三个曲面角。

在下面的讨论中，为了简便，在不加说明的情况下统一选用单位球，如图所示

<center><img src="/content-images/markdown/5187191/image-20260622-215446-857-4k08.png" alt="图片" width=300px></center>

对于角度 $\alpha$，其对应的圆弧长度为 $\alpha$，对应的切线长度为 $\tan\alpha$.

接下来我们将余弦定理推广到球面三角形上，这是一个相对简单的推广，我们借这个推广来让读者对球面三角形有一个初步的认识。

> **Theorem 2. The Spherical Law of Cosines(球面余弦定理).** 设球面三角形的三边长分别为 $\alpha, \beta, \gamma$，且边 $\gamma$ 对应的顶点为 $\Gamma$，则
> $$\cos (\gamma)=\cos (\alpha) \cos (\beta)+\sin (\alpha) \sin (\beta) \cos (\Gamma)$$

首先我们希望将曲面角 $\Gamma$ 表示为平面角，沿用之前的思路，我们将曲面三角形投影到点 $\Gamma$ 所在的切平面上，如图所示

<center><img src="/content-images/external/a3ccc77a132778baed72b2a70c4d8414.png" width=400px></center>

图中红色的边就是 $\gamma$ 的投影边，我们分别在两个三角形中应用平面余弦定理来表示它得到

$$\begin{aligned}
\operatorname{proj}^{2}(\gamma) &= \tan ^2(\alpha)+\tan ^2(\beta)-2 \tan (\alpha) \tan (\beta) \cos (\Gamma) \\
\operatorname{proj}^{2}(\gamma) &= \sec ^2(\alpha)+\sec ^2(\beta)-2 \sec (\alpha) \sec (\beta) \cos (\gamma)
\end{aligned}$$

这样的话，我们就可以联立解出 $\cos (\gamma)$ 的值

$$\cos (\gamma)=\cos (\alpha) \cos (\beta)+\sin (\alpha) \sin (\beta) \cos (\Gamma)$$

根据球面余弦定理，我们有一个推论

> **Corollary 3.** 设球面三角形 $AB\Gamma$ 的三边长为 $\alpha, \beta, \gamma$，则有
> $$\sin (\alpha) \cos (\mathrm{B})=\cos (\beta) \sin (\gamma)-\sin (\beta) \cos (\gamma) \cos (\mathrm{A})$$

我们延长边 $\gamma$ 至 $\frac{\pi}{2}$，如图所示

<center><img src="/content-images/external/035180a0dedc1609be421406fe896a17.png" width=500px></center>

在两个球面三角形中应用 *theorem 2* 表示 $\cos \delta$ 得到

$$\begin{aligned}
\cos (\delta) & =\cos (\alpha) \cos (\pi / 2)+\sin (\alpha) \sin (\pi / 2) \cos (\mathrm{B}) \\
& =\sin (\alpha) \cos (\mathrm{B}) \\
\cos (\delta) & =\cos (\beta) \cos (\pi / 2-c)+\sin (\beta) \sin (\pi / 2-c) \cos (\pi-\mathrm{A}) \\
& =\cos (\beta) \sin (\gamma)-\sin (\beta) \cos (\gamma) \cos (\mathrm{A})
\end{aligned}$$

联立就能得到

$$\sin (\alpha) \cos (\mathrm{B})=\cos (\beta) \sin (\gamma)-\sin (\beta) \cos (\gamma) \cos (\mathrm{A})$$

这个式子给出了边角正余弦积的表达式，因此也被称为正余弦公式。

---

## *2. Semilunar Triangle(半月三角形)*

对于球面上任意一个大圆，球面上一定存在两个点到这个大圆的距离为 $\frac{\pi}{2}$，在这个语境下，我们称这个大圆为 *equator(赤道)*，这两个点为 *pole(极点)*.

我们以地球为例，地球的赤道就是一个大圆，而南北极就是这个大圆对应的两个极点。如图所示

<center><img src="/content-images/external/a6956e667dff754dc8e66d972191dc0d.png" width=600px></center>

在 $\triangle ABC$ 中，点 $A$ 到 $BC$ 所在大圆的距离为 $\frac{\pi}{2}$，因此点 $A$ 是赤道 $BC$ 的一个极点，我们从上方俯视，可以看出弧 $BC$ 的长度就是角 $A$ 的弧度值 $\alpha$.

像  $\triangle ABC$ 这样的，某个顶点与其对边构成赤道极点关系的三角形，我们称之为 *semilunar triangle(半月三角形)*.

> **Theorem 4. Semilunar(半月定理).** 在球面 $\triangle ABC$  的三边与三角中，若任意两个量的弧度值为 $\frac{\pi}{2}$，则该三角形为半月三角形。

证明：为了证明一个球面三角形 $ABC$ 是半月的，不妨设 $A$ 为极点，$BC$ 为赤道，我们需要证明以下的式子成立

$$AB = AC = \angle ABC = \angle ACB = \frac{\pi}{2}, \quad BC = \angle BAC$$

我们分四种情况进行讨论

- **Case 1. 两条直角边.**  不妨设 $\overline{A B} = \overline{A C} = \frac{\pi}{2}$，根据球面余弦定理有

$$\begin{aligned}
\cos (\overline{B C}) & =\cos (\overline{A B}) \cos (\overline{A C})+\sin (\overline{A B}) \sin (\overline{A C}) \cos (\angle B A C) \\
& =\cos \left(\frac{\pi}{2}\right) \cos \left(\frac{\pi}{2}\right)+\sin \left(\frac{\pi}{2}\right) \sin \left(\frac{\pi}{2}\right) \cos (\angle B A C) \\
& =\cos (\angle B A C)
\end{aligned}$$

因此 $\overline{B C} = \angle B A C$，另一方面

$$\begin{aligned}
\cos (\overline{A C}) & =\cos (\overline{A B}) \cos (\overline{B C})+\sin (\overline{A B}) \sin (\overline{B C}) \cos (\angle A B C) \\
\cos \left(\frac{\pi}{2}\right) & =\cos \left(\frac{\pi}{2}\right) \cos (\overline{B C})+\sin \left(\frac{\pi}{2}\right) \sin (\overline{B C}) \cos (\angle A B C) \\
0 & =\sin (\overline{B C}) \cos (\angle A B C)
\end{aligned}$$

由于 $\overline{B C} \in (0, \pi)$，因此 $\cos (\angle A B C)=0$，即 $\angle A B C = \frac{\pi}{2}$，同样的可以证明 $\angle A C B = \frac{\pi}{2}$.

- **Case 2. 两个直角.** 不妨设 $\angle A B C = \angle A C B = \frac{\pi}{2}$，根据球面余弦定理有

$$\begin{aligned}
\cos (\overline{A C}) & =\cos (\overline{A B}) \cos (\overline{B C})+\sin (\overline{A B}) \sin (\overline{B C}) \cos (\angle A B C) \\
& =\cos (\overline{A B}) \cos (\overline{B C})+\sin (\overline{A B}) \sin (\overline{B C}) \cos \left(\frac{\pi}{2}\right) \\
& =\cos (\overline{A B}) \cos (\overline{B C})
\end{aligned}$$

同样的，可以得到 $\cos (\overline{A B})=\cos (\overline{A C}) \cos (\overline{B C})$，联立得到

$$\cos (\overline{A C})=\cos (\overline{A C}) \cos ^2(\overline{B C})$$

用 $1 - \sin ^2(\overline{B C})$ 替换一下得到

$$\cos (\overline{A C}) \sin ^2(\overline{B C})=0$$

由于 $\overline{B C} \in (0, \pi)$，因此 $\overline{A C} = \frac{\pi}{2}$，同样的可以证明 $\overline{B C} = \frac{\pi}{2}$，现在就回到了 **Case 1** 的情况。

- **Case 3. 一条直角边及其对角.** 不妨设 $\angle ABC = \overline{A C} = \frac{\pi}{2}$，根据球面余弦定理有

$$\begin{aligned}
\cos (\overline{A C}) & =\cos (\overline{A B}) \cos (\overline{B C})+\sin (\overline{A B}) \sin (\overline{B C}) \cos (\angle A B C) \\
& =\cos (\overline{A B}) \cos (\overline{B C})+\sin (\overline{A B}) \sin (\overline{B C}) \cos \left(\frac{\pi}{2}\right) \\
& =\cos (\overline{A B}) \cos (\overline{B C}) \\
&= 0
\end{aligned}$$

因此 $\overline{A B} = \frac{\pi}{2}$ 或 $\overline{BC} = \frac{\pi}{2}$，这样就回到了 **Case 1** 的情况。

- **Case 4. 一条直角边及其邻角.** 不妨设 $\angle ABC = \overline{A B} = \frac{\pi}{2}$，根据球面余弦定理有

$$\begin{aligned}
\cos (\overline{A C}) & =\cos (\overline{A B}) \cos (\overline{B C})+\sin (\overline{A B}) \sin (\overline{B C}) \cos (\angle A B C) \\
& =\cos \left(\frac{\pi}{2}\right) \cos (\overline{B C})+\sin \left(\frac{\pi}{2}\right) \sin (\overline{B C}) \cos \left(\frac{\pi}{2}\right) \\
& =0
\end{aligned}$$

因此 $\overline{A C} = \frac{\pi}{2}$，这样就回到了 **Case 1** 的情况。


---

## *3. Dual Triangles(对偶三角形)*

> **Definition 5. Dual Triangle(对偶三角形)** 对于球面 $\triangle ABC$，设 $A^{\prime},B^{\prime},C^{\prime}$ 分别为以 $BC,AC,AB$ 所在大圆为赤道的极点，且分别与 $A,B,C$ 位于对应赤道的同侧，我们称 $\triangle ABC$ 和 $\triangle A^{\prime}B^{\prime}C^{\prime}$ 互为 *dual triangle(对偶三角形)*，如图所示
> <center><img src="/content-images/external/54f64b382c05ea0b84d577df68d3ff02.png" width=400px></center>
> 设 $A,B,C$ 的对边分别为 $a,b,c$，而 $A^{\prime},B^{\prime},C^{\prime}$ 的对边分别为 $a^{\prime},b^{\prime},c^{\prime}$，我们发现
> 
> - 图中的红色边均为极点与赤道的连线，因此长度为 $\frac{\pi}{2}$，所以 $\triangle A B C^{\prime}, \triangle A B^{\prime} C, \triangle A^{\prime} B C$ 为半月三角形
> - 根据半月定理，$\triangle A^{\prime} B^{\prime} C, \triangle A^{\prime} B C^{\prime}, \triangle A B^{\prime} C^{\prime}$ 均为半月三角形
> - $A,B,C$ 也分别为 $\triangle A^{\prime} B^{\prime} C^{\prime}$ 三边的极点，因此对偶性是相互的

对偶三角形拥有很多奇妙的性质，我们接下来介绍一些。

> **Theorem 6.** 在球面 $\triangle ABC$ 及其对偶 $\triangle A^{\prime}B^{\prime}C^{\prime}$ 中，顶角的弧度值与对偶三角形中对边的弧度值互补，即
> $$\angle BAC + a^{\prime} = \pi, \quad \angle ABC + b^{\prime} = \pi, \quad \angle ACB + c^{\prime} = \pi$$

我们以 $\angle C$ 为例，由于 $\triangle A^{\prime} C B^{\prime}, \triangle A B^{\prime} C,  \triangle A^{\prime} B C$  均为半月三角形，因此

$$c^{\prime} = \angle A^{\prime}CB^{\prime},\quad \angle A^{\prime} C B = \angle A C B^{\prime}=\frac{\pi}{2}$$

所以

$$\begin{aligned}
c^{\prime}+\angle A C B & =\angle A^{\prime} C B^{\prime}+\angle A C B \\
& =\angle A^{\prime} C B+\angle A C B^{\prime} \\
& =\frac{\pi}{2}+\frac{\pi}{2} \\
& =\pi
\end{aligned}$$

> **Theorem 7. The Law of Cosines for Angles(角的余弦定理).** 给定球面 $\triangle AB\Gamma$ 的两个角 $A,B$ 及其夹边 $\gamma$，我们可以计算其对角 $\Gamma$ 的余弦值
> $$\cos (\Gamma)=-\cos (\mathrm{A}) \cos (\mathrm{B})+\sin (\mathrm{A}) \sin (\mathrm{B}) \cos (\gamma)$$

之前我们讲的球面余弦定理是用来求边的余弦值的，现在我们利用对偶三角形把它推广到角。

设对偶 $\triangle \mathrm{A}^{\prime} \mathrm{B}^{\prime} \Gamma^{\prime}$ 的三边长分别为 $\alpha^{\prime}, \beta^{\prime}, \gamma^{\prime}$，应用边的余弦定理表示 $\gamma^{\prime}$ 得到

$$\cos \left(\gamma^{\prime}\right)=\cos \left(\alpha^{\prime}\right) \cos \left(\beta^{\prime}\right)+\sin \left(\alpha^{\prime}\right) \sin \left(\beta^{\prime}\right) \cos \left(\Gamma^{\prime}\right)$$

根据 *theorem 6* 建立原始三角形的角和对偶三角形中的边之间的关系，得到

$$\cos (\pi-\Gamma)=\cos (\pi-\mathrm{A}) \cos (\pi-\mathrm{B})+\sin (\pi-\mathrm{A}) \sin (\pi-\mathrm{B}) \cos (\pi-\gamma)$$

化简之后就是

$$\cos (\Gamma)=-\cos (\mathrm{A}) \cos (\mathrm{B})+\sin (\mathrm{A}) \sin (\mathrm{B}) \cos (\gamma)$$

> **Theorem 8. Incircle and Circumcircle Duality(内切圆与外接圆对偶).** 如图所示
> <center><img src="/content-images/external/e888d2c914ac32fcd3183cde99dd764f.png" width=400px></center>
> 在球面 $\triangle A B C$ 中，设 $G$ 为其内切圆圆心，$r$ 为半径，则其对偶 $\triangle A^{\prime} B^{\prime} C^{\prime}$ 的外接圆圆心也为 $G$，且其半径 $R$ 与 $r$ 互补，即
> $$R + r = \frac{\pi}{2}$$

我们设 $D,E,F$ 为内切圆与 $\triangle ABC$ 的切点，则 $GD \perp BC$，由于 $A^{\prime}$ 为赤道 $\overline{B C}$ 的极点，因此 $A^{\prime}D \perp BC$，所以我们延长 $DG$ 一定过点 $A^{\prime}$，且 $\overline{ A^{\prime}D} = \frac{\pi}{2}$，故 $\overline{ A^{\prime}G} = \frac{\pi}{2}-r$，同理可得

$$\overline{ A^{\prime}G} = \overline{ B^{\prime}G}= \overline{ C^{\prime}G} = \frac{\pi}{2}-r$$

因此 $G$ 为 $\triangle A^{\prime} B^{\prime} C^{\prime}$ 的外接圆圆心，且 $\overline{ A^{\prime}G}$ 为半径 $R$，所以

$$r + R = \frac{\pi}{2}$$

---

## *4. Right Spherical Triangles(球面直角三角形)*

> **Theorem 9. Projecting Right Angles(直角的投影).** 如图所示
> <center><img src="/content-images/external/d34dabc2ce32fcc53497b47889590403.png" width=500px></center>
> 在球面 $\triangle ABC$ 中，$\angle ACB$ 为直角，则将 $\triangle ABC$ 投影到任意顶点所在的切平面上后，投影角 $\angle AC^{\prime}B^{\prime}$ 依然是直角。

我们以投影到 $A$ 点所在切平面上为例，首先将 $\triangle ABC$ 沿 $AC$ 边做镜像操作得到 $\triangle ADC$，由于 $\angle ACB = \angle ACD = \frac{\pi}{2}$，因此 $C$ 在弧 $\overline{BD}$ 上。

设 $B^{\prime}, C^{\prime}, D^{\prime}$ 为 $B,C,D$ 在切平面上的投影点，则 $C^{\prime}$ 也在线段 $B^{\prime}D^{\prime}$ 上，因为一段圆弧不可能投影出折线。

且投影可以保证 $\triangle A^{\prime}C^{\prime}B^{\prime} \cong A^{\prime}C^{\prime}D^{\prime}$，因此 $\angle A^{\prime}C^{\prime}B^{\prime} = \angle A^{\prime}C^{\prime}D^{\prime} = \frac{\pi}{2}$.

该定理告诉我们直角在切平面上的投影依然是直角，接下来我们来看非直角的情况。


> **Theorem 10. Projecting Angles(角的投影).** 沿用 *theorem 8* 中的图，将球面 $\triangle ABD$ 投影到任意顶点所在的切平面上，以顶点 $A$ 为例，则非直角 $\angle B \neq \frac{\pi}{2}$ 的投影角 $\angle B^{\prime}$ 满足
> $$\tan \left(\angle B^{\prime}\right)=\tan (\angle B) \cos (\overline{A B})$$

如图所示，过点 $A$ 做弧 $\overline{AC} \perp \overline{BD}$ 垂足为 $C$，而 $B,C,D$ 的投影点分别为 $B^{\prime},C^{\prime},D^{\prime}$，那么根据 *theorem 9* 有

$$\angle A^{\prime} C^{\prime} B^{\prime}=\angle A^{\prime} C^{\prime} D^{\prime}=\frac{\pi}{2}$$

在 $\triangle ABC$ 中应用角的余弦定理有

$$\cos (\angle A C B)=-\cos (\angle C A B) \cos (\angle B)+\sin (\angle C A B) \sin (\angle B) \cos (\overline{A B})$$

而 $\cos (\angle A C B) = 0$，因此

$$\tan (\angle C A B) \tan (\angle B) \cos (\overline{A B})=1$$

根据切平面的性质有 $\angle C A B=\angle C^{\prime} A B^{\prime} = \frac{\pi}{2} - \angle B^{\prime}$，因此

$$\tan (\angle C A B) \tan \left(\angle B^{\prime}\right)=1$$

联立即可得到

$$\tan \left(\angle B^{\prime}\right)=\tan (\angle B) \cos (\overline{A B})$$

> **Theorem 11. Spherical Pythagorean Theorem(球面毕达哥拉斯定理).** 如图所示
> <center><img src="/content-images/external/ca9379149f29e626ec1ba11ddc7bbaf2.png" width=350px></center> 
> 在球面直角三角形中，设 $\alpha,\beta$ 为两条直角边，$\gamma$ 为斜边，$\Gamma$ 为直角，则
> $$\cos (\alpha) \cos (\beta)=\cos (\gamma)$$

应用球面余弦定理，很容易可以证明

$$\begin{aligned}
\cos (\gamma) & =\cos (\alpha) \cos (\beta)+\sin (\alpha) \sin (\beta) \cos (\Gamma) \\
& =\cos (\alpha) \cos (\beta)+\sin (\alpha) \sin (\beta) \cos \left(\frac{\pi}{2}\right) \\
& =\cos (\alpha) \cos (\beta)
\end{aligned}$$

> **Theorem 12. Right Spherical Identities(球面直角恒等式).** 沿用 *theorem 10* 中的图，在球面直角 $\triangle AB\Gamma$ 中，两条直角边 $\alpha,\beta$ 的对角为 $A,B$，斜边 $\gamma$ 的对角 $\Gamma$ 为直角，则
> $$\begin{array}{ll}
\sin (\mathrm{A})=\frac{\sin (\alpha)}{\sin (\gamma)}, & \sin (\mathrm{B})=\frac{\sin (\beta)}{\sin (\gamma)} \\
\cos (\mathrm{A})=\frac{\tan (\beta)}{\tan (\gamma)}, & \cos (\mathrm{B})=\frac{\tan (\alpha)}{\tan (\gamma)} \\
\tan (\mathrm{A})=\frac{\tan (\alpha)}{\sin (\beta)}, & \tan (\mathrm{B})=\frac{\tan (\beta)}{\sin (\alpha)}
\end{array}$$

我们以 $\angle A$ 为例，将 $\triangle AB\Gamma$ 投影到 $A$ 所在的切平面上得到 $\triangle \mathrm{AB}^{\prime} \Gamma^{\prime}$，根据 *theorem 9*，$\Gamma^{\prime}$ 也是直角，而

$$\mathrm{AB}^{\prime}=\tan (\gamma),\quad \mathrm{A} \Gamma^{\prime}=\tan (\beta)$$

根据顶点 $A$ 所在切平面的投影角性质，我们得到

$$\cos (A) = \cos (A^{\prime}) = \frac{\tan (\beta)}{\tan (\gamma)}$$

接下来换一种投影方式，我们将 $\triangle AB\Gamma$ 投影到直角 $\Gamma$ 所在的切平面上得到 $\triangle \mathrm{AB}^{\prime} \Gamma^{\prime}$，则

$$A^{\prime}\Gamma = \tan(\beta)，\quad B^{\prime}\Gamma = \tan(\alpha)$$

根据 *theorem 9* 有

$$ \tan (\mathrm{A})=\frac{\tan \left(\mathrm{A}^{\prime}\right)}{\cos (\beta)} = \frac{\tan (\alpha)}{\tan (\beta)\cos (\beta)} = \frac{\tan (\alpha)}{\sin (\beta)}$$

最后，我们结合 $\cos$ 和 $\tan$ 的表达式得到

$$\begin{aligned}
\sin (\mathrm{A}) & =\frac{\tan (\alpha)}{\sin (\beta)} \frac{\tan (\beta)}{\tan (\gamma)} \\
& =\frac{\sin (\alpha)}{\sin (\gamma)} \frac{\cos (\gamma)}{\cos (\alpha) \cos (\beta)} \\
& =\frac{\sin (\alpha)}{\sin (\gamma)}
\end{aligned}$$

其中最后一步的化简是通过 *theorem 11* 球面毕达哥拉斯定理得到的。

---

## *5. Spherical Trigonometric Formulas(球面三角公式)*

> **Theorem 13. The Spherical Law of Sines(球面正弦定理).** 如图所示
> <center><img src="/content-images/external/f514cc975d49aca2bd46f4f0db691983.png" width=350px></center> 
> 在球面 $\triangle A B C$ 中，设角 $A,B$ 的对边为 $a,b$，则
> $$\frac{\sin (a)}{\sin (A)}=\frac{\sin (b)}{\sin (B)}$$

如图所示，过点 $C$ 做 $\overline{CD}\perp \overline{AB}$ 垂足为 $D$，则根据 *theorem 12* 中的正弦表示，有

$$\sin (A)=\frac{\sin (h)}{\sin (b)},\quad \sin (B)=\frac{\sin (h)}{\sin (a)}$$

代入即可得证。

球面余弦定理告诉我们，已知两边及其夹角，可以求出另一边的 $\cos$ 值。作为补充，下面的定理给出了求其它两个角 $\tan$ 值的方法

> **Theorem 14.**  设球面 $\triangle ABC$ 的三边长分别为 $a,b,c$，则
> $$\tan (A)=\frac{\tan (a) \sec (b) \sin (C)}{\tan (b)-\tan (a) \cos (C)}$$

根据正弦定理，有

$$\begin{aligned}
\tan (A) =\frac{\sin (A)}{\cos (A)} =\frac{\sin (a) \sin (C)}{\sin (c) \cos (A)}
\end{aligned}$$

我们发现分母中出现了边角正余弦相乘的项，用 *corollary 3* 的正余弦公式替换这一项得到

$$\begin{aligned} \tan (A)
& =\frac{\sin (a) \sin (C)}{\cos (a) \sin (b)-\sin (a) \cos (b) \cos (C)} \\
& =\frac{\tan (a) \sec (b) \sin (C)}{\tan (b)-\tan (a) \cos (C)}
\end{aligned}$$

在进行接下来的公式推导前，我们需要先来复习一些三角恒等式

> **Theorem 15. Sum-to-Product(和差化积).**
> $$\begin{aligned}
& \sin (x)+\sin (y)=2 \sin \left(\frac{x+y}{2}\right) \cos \left(\frac{x-y}{2}\right) \\
& \sin (x)-\sin (y)=2 \cos \left(\frac{x+y}{2}\right) \sin \left(\frac{x-y}{2}\right) \\
& \cos (x)+\cos (y)=2 \cos \left(\frac{x+y}{2}\right) \cos \left(\frac{x-y}{2}\right) \\
& \cos (y)-\cos (x)=2 \sin \left(\frac{x+y}{2}\right) \sin \left(\frac{x-y}{2}\right)
\end{aligned}$$

<div></div>

> **Theorem 16. Product-to-Sum(积化和差).**
> $$\begin{aligned}
& \sin (u+v)+\sin (u-v)=2 \sin (u) \cos (v) \\
& \sin (u+v)-\sin (u-v)=2 \cos (u) \sin (v) \\
& \cos (u+v)+\cos (u-v)=2 \cos (u) \cos (v) \\
& \cos (u-v)-\cos (u+v)=2 \sin (u) \sin (v)
\end{aligned}$$

<div></div>

使用和差化积公式，我们可以很容易得到如下的推论

> **Corollary 17.**
> $$\frac{\sin (x)+\sin (y)}{\cos (x)+\cos (y)}=\tan \left(\frac{x+y}{2}\right)$$

有了这些前置知识，我们就可以来推一些半角相关的奇妙公式了。

> **Theorem 18. Spherical Half-Angle Formulas(球面半角公式).** 设球面 $\triangle ABC$ 的三边分别为 $a,b,c$，设半周长 $s=\frac{1}{2}(a+b+c)$，则
> $$\begin{aligned}
\sin ^2\left(\frac{A}{2}\right) &= \frac{\sin (s-b) \sin (s-c)}{\sin (b) \sin (c)}\\
\cos ^2\left(\frac{A}{2}\right) &= \frac{\sin (s) \sin (s-a)}{\sin (b) \sin (c)}
\end{aligned}$$

根据球面余弦定理，有

$$\cos (A)=\frac{\cos (a)-\cos (b) \cos (c)}{\sin (b) \sin (c)}$$

因此，根据相关三角公式，有

$$\begin{aligned}
\sin ^2\left(\frac{A}{2}\right) & =\frac{1-\cos (A)}{2} \quad \text{(二倍角公式)}\\
& =\frac{\sin (b) \sin (c)+\cos (b) \cos (c)-\cos (a)}{2 \sin (b) \sin (c)} \\
& =\frac{\cos (b-c)-\cos (a)}{2 \sin (b) \sin (c)} \quad \text{(和角公式)} \\
& =\frac{\sin (s-b) \sin (s-c)}{\sin (b) \sin (c)} \quad \text{(和差化积)}
\end{aligned}$$

类似的，有

$$\begin{aligned}
\cos ^2\left(\frac{A}{2}\right) & =\frac{1+\cos (A)}{2} \\
& =\frac{\cos (a)-\cos (b) \cos (c)+\sin (b) \sin (c)}{2 \sin (b) \sin (c)} \\
& =\frac{\cos (a)-\cos (b+c)}{2 \sin (b) \sin (c)} \\
& =\frac{\sin (s) \sin (s-a)}{\sin (b) \sin (c)}
\end{aligned}$$

根据二倍角公式的结果，我们有如下推论

> **Corollary 19.** 设球面 $\triangle ABC$ 的三边分别为 $a,b,c$，且半周长 $s=\frac{1}{2}(a+b+c)$，则
> $$\begin{aligned}
\sin \left(\frac{A}{2}\right) \sin \left(\frac{B}{2}\right) & =\sin \left(\frac{C}{2}\right) \frac{\sin (s-c)}{\sin (c)} \\
\sin \left(\frac{A}{2}\right) \cos \left(\frac{B}{2}\right) & =\cos \left(\frac{C}{2}\right) \frac{\sin (s-b)}{\sin (c)} \\
\cos \left(\frac{A}{2}\right) \cos \left(\frac{B}{2}\right) & =\sin \left(\frac{C}{2}\right) \frac{\sin (s)}{\sin (c)}
\end{aligned}$$

这些推论的证明是不难的，我们以第一个式子为例

$$\begin{aligned}
\sin \left(\frac{A}{2}\right) \sin \left(\frac{B}{2}\right) & =\sqrt{\frac{\sin (s-a) \sin (s-b) \sin ^2(s-c)}{\sin (a) \sin (b) \sin ^2(c)}} \\
& =\sin \left(\frac{C}{2}\right) \frac{\sin (s-c)}{\sin (c)}
\end{aligned}$$

> **Theorem 20. Sum of Half-Angle(半角和差公式).** 设球面 $\triangle ABC$ 的三边分别为 $a,b,c$，则
> $$\begin{aligned}
\cos \left(\frac{A+B}{2}\right) &= \sin \left(\frac{C}{2}\right) \frac{\cos \left(\frac{a+b}{2}\right)}{\cos \left(\frac{c}{2}\right)} \\
\sin \left(\frac{A+B}{2}\right) &= \cos \left(\frac{C}{2}\right) \frac{\cos \left(\frac{a-b}{2}\right)}{\cos \left(\frac{c}{2}\right)} \\
\cos \left(\frac{A-B}{2}\right) &= \sin \left(\frac{C}{2}\right) \frac{\sin \left(\frac{a+b}{2}\right)}{\sin \left(\frac{c}{2}\right)} \\
\sin \left(\frac{A-B}{2}\right) &= \cos \left(\frac{C}{2}\right) \frac{\sin \left(\frac{a-b}{2}\right)}{\sin \left(\frac{c}{2}\right)}
\end{aligned}$$

这些公式的证明思路都是一样的，我们以第一个为例

$$\begin{aligned}
\cos \left(\frac{A+B}{2}\right) & =\cos \left(\frac{A}{2}\right) \cos \left(\frac{B}{2}\right)-\sin \left(\frac{A}{2}\right) \sin \left(\frac{B}{2}\right) \quad \text(和角公式)\\
& =\sin \left(\frac{C}{2}\right) \frac{\sin (s)-\sin (s-c)}{\sin (c)} \quad\text{(Corollary 19)}\\
& =\sin \left(\frac{C}{2}\right) \frac{2 \cos \left(\frac{a+b}{2}\right) \sin \left(\frac{c}{2}\right)}{\sin (c)} \quad \text({和差化积})\\
& =\sin \left(\frac{C}{2}\right) \frac{\cos \left(\frac{a+b}{2}\right)}{\cos \left(\frac{c}{2}\right)} \quad \text({二倍角公式})
\end{aligned}$$

根据该定理，我们把 $\sin$ 和 $\cos$ 的表达式相除，就能得到如下关于 $\tan$ 半角和差的推论

> **Corollary 21.** 设球面 $\triangle ABC$ 的三边分别为 $a,b,c$，则
> $$\begin{aligned}
\tan \left(\frac{A+B}{2}\right) \tan \left(\frac{C}{2}\right) & =\frac{\cos \left(\frac{a-b}{2}\right)}{\cos \left(\frac{a+b}{2}\right)} =\frac{1+\tan \left(\frac{a}{2}\right) \tan \left(\frac{b}{2}\right)}{1-\tan \left(\frac{a}{2}\right) \tan \left(\frac{b}{2}\right)} \\
\tan \left(\frac{A-B}{2}\right) \tan \left(\frac{C}{2}\right) & =\frac{\sin \left(\frac{a-b}{2}\right)}{\sin \left(\frac{a+b}{2}\right)}  =\frac{\tan \left(\frac{a}{2}\right)-\tan \left(\frac{b}{2}\right)}{\tan \left(\frac{a}{2}\right)+\tan \left(\frac{b}{2}\right)}
\end{aligned}$$

将这两个式子相除就能得到

> **Corollary 22.** 设球面 $\triangle ABC$ 的三边分别为 $a,b,c$，则
> $$\frac{\tan \left(\frac{A-B}{2}\right)}{\tan \left(\frac{A+B}{2}\right)}=\frac{\tan \left(\frac{a-b}{2}\right)}{\tan \left(\frac{a+b}{2}\right)}$$

--- 

## *6. Spherical Excess(球面角超)*

> **Definition 23. Spherical Excess(球面角超).** 在平面三角形中，三内角和的弧度值为 $\pi$，而在球面三角形中，三内角和必定大于 $\pi$，我们定义球面 $\triangle ABC$ 的 *Spherical Excess* 为
> $$E = A+B+C-\pi$$

<div></div>

> **Theorem 24. Girard’s Theorem.** 设球面 $\triangle ABC$ 的球面角超为 $E$，则其面积
> $$S_{\triangle ABC} = E$$

这个定理的证明是比较 *trick* 的，如图所示

<center><img src="/content-images/external/c86a9cc61f172c005b051221e87626dc.png" width=350px></center> 

观察 $\triangle ABC$ 中 $\angle A$ 所在的两个大圆，它们在球面上相夹而成的 *double wedge(双楔形)* 区域 $D_{A}$（图中阴影部分）的面积与 $\angle A$ 的大小呈线性关系，而当 $\angle A= \pi$ 时，这个区域就是整个球面，其面积为 $4\pi$，因此 $D_{A}$ 的面积为

$$S_{A} = 4 \angle A$$

考虑将三个顶点 $A,B,C$ 对应的双楔形区域 $D_{A},D_{B},D_{C}$ 相加，我们在图中可以看到，其覆盖了整个球面，并且将 $\triangle ABC$ 覆盖了 $6$ 次（每个顶角正反面各一次），因此

$$S_{A} + S_{B} + S_{C} = 4\pi + 4S_{\triangle ABC}$$

化简得到

$$S_{\triangle ABC} = \frac{S_{A} + S_{B} + S_{C}}{4} - \pi = E$$

*Girard’s Theorem* 告诉我们已知球面三角形三个内角的情况下，可以求出它的面积。那么如果我们只知道三边长呢？

还记得在平面三角形中，使用海伦公式可以很方便的求出三角形面积，我们可以把它推广到球面三角形上。

> **Theorem 25. L’Huilier’s Formula(海伦公式).** 设球面 $\triangle ABC$ 的三边长分别为 $a,b,c$，且半周长 $s=\frac{1}{2}(a+b+c)$，则其球面角超 $E$ 满足
> $$\tan \left(\frac{E}{4}\right)=\sqrt{\tan \left(\frac{s}{2}\right) \tan \left(\frac{s-a}{2}\right) \tan \left(\frac{s-b}{2}\right) \tan \left(\frac{s-c}{2}\right)}$$

首先，我们使用 *Corollary 17* 将左边的 $\tan$ 展开得到

$$\begin{aligned}
\tan \left(\frac{E}{4}\right) & =\tan \left(\frac{A+B+C-\pi}{4}\right) \\
& =\frac{\sin \left(\frac{A+B}{2}\right)+\sin \left(\frac{C-\pi}{2}\right)}{\cos \left(\frac{A+B}{2}\right)+\cos \left(\frac{C-\pi}{2}\right)} \\
& =\frac{\sin \left(\frac{A+B}{2}\right)-\cos \left(\frac{C}{2}\right)}{\cos \left(\frac{A+B}{2}\right)+\sin \left(\frac{C}{2}\right)}
\end{aligned}$$

接下来使用 *Theorem 20* 中的半角和差公式处理 $\sin \left(\frac{A+B}{2}\right)$ 和 $\cos \left(\frac{A+B}{2}\right)$ 得到

$$LHS = \frac{\left(\cos \left(\frac{a-b}{2}\right)-\cos \left(\frac{c}{2}\right)\right) \cos \left(\frac{C}{2}\right)}{\left(\cos \left(\frac{a+b}{2}\right)+\cos \left(\frac{c}{2}\right)\right) \sin \left(\frac{C}{2}\right)}$$

使用和差化积公式处理左边部分，使用 *Theorem 18* 的半角公式处理右边部分得到

$$\begin{aligned} LHS 
& =\frac{2 \sin \left(\frac{s-a}{2}\right) \sin \left(\frac{s-b}{2}\right)}{2 \cos \left(\frac{s}{2}\right) \cos \left(\frac{s-c}{2}\right)} \sqrt{\frac{\sin (s) \sin (s-c)}{\sin (s-a) \sin (s-b)}} \\
& =\sqrt{\tan \left(\frac{s}{2}\right) \tan \left(\frac{s-a}{2}\right) \tan \left(\frac{s-b}{2}\right) \tan \left(\frac{s-c}{2}\right)}
\end{aligned}$$

现在我们得到了一般三角形的面积公式，如果是直角三角形的话，计算公式会更加简洁。

> **Theorem 26. ** 设球面直角 $\triangle ABC$ 的三边长分别为 $a,b,c$，且 $C$ 为直角，则其球面角超 $E$ 满足
> $$\tan \left(\frac{E}{2}\right)=\tan \left(\frac{a}{2}\right) \tan \left(\frac{b}{2}\right)$$

首先使用和差角公式 $\tan (a+b)=\frac{\tan (a)+\tan (b)}{1-\tan(a) \tan(b)}$ 展开得到

$$\begin{aligned}
\tan \left(\frac{E}{2}\right) & =\tan \left(\frac{A+B}{2}-\frac{\pi}{4}\right) \\
& =\frac{\tan \left(\frac{A+B}{2}\right)-1}{\tan \left(\frac{A+B}{2}\right)+1}
\end{aligned}$$

我们使用 *Corollary 21* 来处理 

$$\tan \left(\frac{A+B}{2}\right) = \frac{1+\tan \left(\frac{a}{2}\right) \tan \left(\frac{b}{2}\right)}{1-\tan \left(\frac{a}{2}\right) \tan \left(\frac{b}{2}\right)}\cdot \frac{1}{\tan \left(\frac{C}{2}\right)} = \frac{1+\tan \left(\frac{a}{2}\right) \tan \left(\frac{b}{2}\right)}{1-\tan \left(\frac{a}{2}\right) \tan \left(\frac{b}{2}\right)}$$

得到

$$\tan \left(\frac{E}{2}\right) = \tan \left(\frac{a}{2}\right) \tan \left(\frac{b}{2}\right)$$

---

## *7. Back to Winding Number Problem*

现在回到最初的环绕数问题，我们需要求一个三角面片 $f_{i}$ 关于空间一点 $P$ 的立体角 $\Omega_{f_i}(P)$.

为了求立体角，我们需要把三角面片 $f_{i}(A,B,C)$ 投影到以 $P$ 为球心的单位球面上得到球面 $\triangle A^{\prime}B^{\prime}C^{\prime}$，那么根据余弦定理可以求得其三边长

$$a^{\prime} = \angle BPC = \arccos\left(\frac{PB^{2} + PC^{2} - BC^{2}}{2 PB\cdot PC}\right)$$

$$b^{\prime} = \angle APC = \arccos\left(\frac{PA^{2} + PC^{2} - AC^{2}}{2 PA\cdot PC}\right)$$

$$c^{\prime} = \angle APB = \arccos\left(\frac{PA^{2} + PB^{2} - AB^{2}}{2 PA\cdot PB}\right)$$

现在有了三边长，我们就可以求出投影三角形的面积，进而得到我们想要的立体角

$$\Omega = E = 4 \arctan\left(\sqrt{\tan \left(\frac{s^{\prime}}{2}\right) \tan \left(\frac{s^{\prime}-a^{\prime}}{2}\right) \tan \left(\frac{s^{\prime}-b^{\prime}}{2}\right) \tan \left(\frac{s^{\prime}-c^{\prime}}{2}\right)}\right)$$

其中半周长 $s^{\prime} = \frac{1}{2}(a^{\prime}+b^{\prime}+c^{\prime})$，完美解决。

--- 

## *Reference*

- https://www.math.ucla.edu/~robjohn/math/spheretrig.pdf
- https://en.wikipedia.org/wiki/Solid_angle#cite_note-4
- https://github.com/google/s2geometry/issues/190
- https://libigl.github.io/tutorial/#generalized-winding-number
