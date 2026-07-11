---
type: markdown
title: Fourier Analysis Note(0) 黎曼积分
slug: "2901263"
date: 2024-01-18
updatedAt: 2026-07-11 17:26:38
tags:
  - 傅里叶分析
published: true
category: mathmatics
---

恰逢一年双十一，入手 *Stein* 教授的分析四部曲，少年开始了新的旅程。

开卷的便是这本 [*Fourier analysis(傅里叶分析)*](https://kryakin.site/am2/Stein-Shakarchi-1-Fourier_Analysis.pdf)

<center><img src="/content-images/external/f62346a04388ad29907fc2c95d9694ca.jpg" width=180></center>

它与 *Partial differential equations(偏微分方程)* 和 *Number theory(数论)* 有着密切的联系，在研究解析数论之前，我们需要对傅里叶分析有一定的了解。

阅读本书仅需要初等的微积分与线性代数的相关知识，以及对 *Riemann integral(黎曼积分)* 有一定的了解，因此在进行傅里叶分析的学习之前，我们先讲解一下前置技能黎曼积分的相关知识。

---

## *1、Definition of the Riemann Integral(黎曼积分的定义)*

> **Definition 1. Partition(分割).** 设函数 $f$ 是定义在闭区间 $[a,b]\subset \mathbb{R}$ 上的有界实函数，记 $[a,b]$ 的一个 *partition(分割)* $P=\{x_{0},x_{1},\cdots,x_{N}\}$ 满足
> $$a=x_{0}<x_{1}<\cdots<x_{N-1}<x_{N}=b$$ 设 $I_{j}$ 表示区间 $[x_{j-1},x_{j}]$，且 $|I_{j}|$ 表示区间长度，我们定义 $f$ 在分割 $P$ 上的 *upper sum(上界和)* 与 *lower sum(下界和)* 分别为
> $$\mathcal{U}(P, f)=\sum_{j=1}^{N}\left[\sup _{x \in I_{j}} f(x)\right]\left|I_{j}\right|$$ $$\mathcal{L}(P, f)=\sum_{j=1}^{N}\left[\inf _{x \in I_{j}} f(x)\right]\left|I_{j}\right|$$

由于 $f$ 是有界函数，定义式中的 *supremum(上确界)* 和 *infimum(下确界)* 必定存在，根据定义显然有 

$$\mathcal{U}(P, f) \geq \mathcal{L}(P, f)$$

> **Definition 2. Riemann Integrable(黎曼可积).** 设 $f$ 是定义在 $[a,b]\subset \mathbb{R}$ 上的有界实函数，若对于任意的 $\epsilon>0$，存在分割 $P$ 使得
> $$\mathcal{U}(P, f)-\mathcal{L}(P, f)<\epsilon$$ 那么我们称 $f$ 是 *Riemann integrable(黎曼可积的)*.

为了定义这个积分的值，我们需要做一些简单而重要的观察。

如果在分割 $P$ 中加入新的分割点得到分割 $P^{\prime}$，那么我们称 $P^{\prime}$ 是 $P$ 的一个 *refinement(改良)*，容易验证

$$\mathcal{U}\left(P^{\prime}, f\right) \leq \mathcal{U}(P, f)$$

$$\mathcal{L}\left(P^{\prime}, f\right) \geq \mathcal{L}(P, f)$$
    
据此，如果 $P_{1},P_{2}$ 是 $[a,b]$ 的两个分割，那么

$$\mathcal{U}\left(P_{1}, f\right) \geq \mathcal{L}\left(P_{2}, f\right)$$

这是因为存在一个同时是 $P_{1},P_{2}$ 的改良的分割 $P^{\prime}$ 使得

$$\mathcal{U}\left(P_{1}, f\right) \geq \mathcal{U}\left(P^{\prime}, f\right) \geq \mathcal{L}\left(P^{\prime}, f\right) \geq \mathcal{L}\left(P_{2}, f\right)$$

由于 $f$ 有界，由下式定义的

$$U=\inf _{P} \mathcal{U}(P, f)$$

$$L=\sup _{P} \mathcal{L}(P, f)$$

存在且 $U\geq L$，若 $f$ 可积则必须有 $U=L$，我们定义积分值为

$$\int_{a}^{b} f(x)dx=U=L$$

最后，一个复函数 $f=u+iv$ 是可积的当且仅当它的实部和虚部都是可积的，且积分值

$$\int_{a}^{b} f(x) d x=\int_{a}^{b} u(x) d x+i \int_{a}^{b} v(x) d x$$

我们看一些例子，常函数是可积函数，且显然

$$\int_{a}^{b} c d x=c(b-a)$$

连续函数也是可积函数，因为连续函数在有界闭区间 $[a,b]$ 上一致连续，也就是说，给定 $\epsilon>0$，存在 $\delta$ 满足

$$|x-y|<\delta\Rightarrow |f(x)-f(y)|<\epsilon$$

因此我们选择一个 $n$ 使得 $\frac{b-a}{n}<\delta$，则分割

$$P=\{a, a+\frac{b-a}{n}, \dots, a+k \frac{b-a}{n}, \dots, a+(n-1) \frac{b-a}{n}, b\}$$

满足 $\mathcal{U}(P, f)-\mathcal{L}(P, f) \leq \epsilon(b-a)$.

> **Theorem 3. Basic properties(基本性质).** 若函数 $f,g$ 在 $[a,b]$ 上可积，则
> 
> （1）$f+g$ 可积，且
> $$\int_{a}^{b} f(x)+g(x) d x=\int_{a}^{b} f(x) d x+\int_{a}^{b} g(x) d x$$
> （2）若 $c\in \mathbb{C}$，则
> $$\int_{a}^{b} c f(x) d x=c \int_{a}^{b} f(x) d x$$
> （3）若 $f,g$ 是实函数且 $f(x)\leq g(x)$，则
> $$\int_{a}^{b} f(x) d x\leq \int_{a}^{b} g(x) d x$$
> （4）若 $c\in [a,b]$，则
> $$\int_{a}^{b} f(x) d x=\int_{a}^{c} f(x) d x+\int_{c}^{b} f(x) d x$$

证明：对于 $(1)$，我们假设 $f,g$ 都是实函数，且 $P$ 是 $[a,b]$ 的一个分割，那么

$$\mathcal{U}(P, f+g) \leq \mathcal{U}(P, f)+\mathcal{U}(P, g)$$

$$\mathcal{L}(P, f+g) \geq \mathcal{L}(P, f)+\mathcal{L}(P, g)$$

给定 $\epsilon>0$，存在分割 $P_{1},P_{2}$ 使得

$$\mathcal{U}\left(P_{1}, f\right)-\mathcal{L}\left(P_{1}, f\right)<\epsilon$$

$$\mathcal{U}\left(P_{2}, g\right)-\mathcal{L}\left(P_{2}, g\right)<\epsilon$$

因此若 $P_{0}$ 是 $P_{1},P_{2}$ 的一个共同改良，那么

$$\mathcal{U}\left(P_{0}, f+g\right)-\mathcal{L}\left(P_{0}, f+g\right)<2 \epsilon$$

因此 $f+g$ 可积，设

$$I=\int_{a}^{b}(f+g)(x)dx=\inf _{P} \mathcal{U}(P, f+g)=\sup _{P} \mathcal{L}(P, f+g)$$

那么有

$$\begin{aligned} I \leq \mathcal{U}\left(P_{0}, f+g\right) \leq \mathcal{U}\left(P_{0}, f\right)+\mathcal{U}\left(P_{0}, g\right)  \leq \int_{a}^{b} f(x) d x+\int_{a}^{b} g(x) d x+2 \epsilon \end{aligned}$$

最后一步需要稍作解释，根据黎曼可积的定义，分割 $P_{1}$ 满足

$$\int_a^b f(x) d x = \sup _P \mathcal{L}(P, f) \geq \mathcal{L}(P_{1}, f) > \mathcal{U}(P_{1}, f) - \epsilon \geq \mathcal{U}(P_{0}, f) - \epsilon $$
 
对于函数 $g$ 也是一样的，因此上式成立。对另一边做同样的操作可以得到

$$\int_a^b f(x) d x+\int_a^b g(x) d x-2 \epsilon \leq I \leq \int_a^b f(x) d x+\int_a^b g(x) d x+2 \epsilon$$
 
这样我们就证明了 $(1)$ 成立，对于 $(2)(3)$ 的证明是类似的，而对于 $(4)$ 我们只需要在 $[a,b]$ 的分割 $P$ 中加入点 $c$ 即可。

> **Theorem 4. Composition(复合函数).** 若 $f$ 是 $[a,b]$ 上的实值可积函数，且 $\varphi$ 是 $\mathbb{R}$ 上的实值连续函数，则复合函数
$$\varphi \circ f = \varphi(f(x))$$ 在 $[a,b]$ 上黎曼可积。

证明：由于 $f$ 可积必定有界，不妨设 $|f|\leq M$，设 $\epsilon>0$.

因为 $\varphi$ 在 $[-M,M]$ 上一致连续，我们可以选择 $\delta>0$ 使得对于任意的 $s,t\in [-M,M]$，有

$$|s-t|<\delta\Rightarrow |\varphi(s)-\varphi(t)|<\epsilon$$

现在选择 $[a,b]$ 的一个分割 $P=\left\{x_{0}, \dots, x_{N}\right\}$ 使得

$$\mathcal{U}(P, f)-\mathcal{L}(P, f)<\delta^{2}$$

设 $I_{j}=[x_{j-1},x_{j}]$，接下来我们分类讨论

- 我们记 $j\in\Lambda$ 如果 $\sup _{x \in I_{j}} f(x)-\inf _{x \in I_{j}} f(x)<\delta$，那么

$$\sup _{x \in I_{j}} \varphi \circ f(x)-\inf _{x \in I_{j}} \varphi \circ f(x)<\epsilon$$

- 否则我们记 $j \in \Lambda^{\prime}$，那么

$$\delta \sum_{j \in \Lambda^{\prime}}\left|I_{j}\right| \leq \sum_{j \in \Lambda^{\prime}}\left[\sup _{x \in I_{j}} f(x)-\inf _{x \in I_{j}} f(x)\right]\left|I_{j}\right| \leq \delta^{2}$$

我们将分割 $P$ 拆成这两种情况，可以推导出

$$\begin{aligned}
\mathcal{U}(P, \varphi \circ f)-\mathcal{L}(P, \varphi \circ f) 
&= \sum_{j=1}^N\left[\sup _{x \in I_j}  \varphi \circ f(x) - \inf _{x \in I_j}  \varphi \circ f(x)  \right]\left|I_j\right| \\
&=  \sum_{j\in\ \Lambda}\left[\sup _{x \in I_j}  \varphi \circ f(x) - \inf _{x \in I_j}  \varphi \circ f(x)  \right]\left|I_j\right| + \sum_{j\in \Lambda^{\prime}}\left[\sup _{x \in I_j}  \varphi \circ f(x) - \inf _{x \in I_j}  \varphi \circ f(x)  \right]\left|I_j\right| \\
& \leq \epsilon(b-a)+2 \mathcal{B} \delta
\end{aligned}$$

其中 $\mathcal{B}$ 是 $|\varphi|$ 在 $[-M,M]$ 的上界，证毕。

根据 *Theorem 4*，我们可以得到如下推论：

> **Lemma 5.** 若 $f,g$ 是 $[a,b]$ 上的可积函数，则
>
> （1） $|f|$ 也是 $[a,b]$ 上的可积函数，且
> $$\left|\int_{a}^{b} f(x) d x\right| \leq \int_{a}^{b}|f(x)| d x$$
> （2） $fg$ 也是 $[a,b]$ 上的可积函数。

对于 $(1)$，只需在 *Theorem 4* 中令 $\varphi(t)=|t|$，结合 *Theorem 3* 中的 $(3)$ 即可证明。

对于 $(2)$，我们知道

$$fg=\frac{1}{4}\left([f+g]^{2}-[f-g]^{2}\right)$$

只需在 *Theorem 4* 中取 $\varphi(t)=t^{2}$，结合 *Theorem 3* 即可证明。



> **Theorem 6.** 定义在区间 $[a,b]$ 上的单调有界函数必定可积。

证明：不失一般性的，我们选择区间 $[0,1]$ 上的单调递增函数 $f$，设分割 $P_{N}=\{0,\frac{1}{N},\frac{2}{N},\cdots,1\}$，且 $\alpha_{j}=f(x_{j})$，那么

$$\mathcal{U}\left(P_{N}, f\right)=\frac{1}{N} \sum_{j=1}^{N} \alpha_{j},\quad \mathcal{L}\left(P_{N}, f\right)=\frac{1}{N} \sum_{j=1}^{N} \alpha_{j-1}$$

设 $B$ 是 $|f|$ 的上界，那么

$$\mathcal{U}\left(P_{N}, f\right)-\mathcal{L}\left(P_{N}, f\right)=\frac{\alpha_{N}-\alpha_{0}}{N} \leq \frac{2 B}{N}$$

调整 $N$ 的取值得到相应的 $\epsilon$，即可完成证明。

> **Theorem 7.** 设 $f$ 是闭区间 $[a,b]$ 上的有界函数，若 $c\in (a,b)$，且对于任意小的 $\delta$，$f$ 在区间 $[a,c-\delta]$ 和 $[c+\delta,b]$ 上可积，那么 $f$ 在 $[a,b]$ 上可积。

设 $|f|$ 的上界为 $M$，对于任意的 $\epsilon>0$，取足够小的 $\delta$ 使得

$$4\delta M\leq \frac{\epsilon}{3}$$

由于 $f$ 在区间上可积，我们可以分别选取区间 $[a,c-\delta],[c+\delta,b]$ 上的分割 $P_{1},P_{2}$ 使得

$$\mathcal{U}\left(P_{1}, f\right)-\mathcal{L}\left(P_{1}, f\right)<\epsilon / 3$$

$$\mathcal{U}\left(P_{2}, f\right)-\mathcal{L}\left(P_{2}, f\right)<\epsilon / 3$$

设分割 $P=P_{1} \cup\{c-\delta\} \cup\{c+\delta\} \cup P_{2}$，那么

$$\begin{aligned}\mathcal{U}(P, f)-\mathcal{L}(P, f)
&= \mathcal{U}\left(P_1, f\right)-\mathcal{L}\left(P_1, f\right) + \mathcal{U}\left(P_2, f\right)-\mathcal{L}\left(P_2, f\right) + \left[\sup _{x \in [c-\delta, c+\delta]} f(x) - \inf _{x \in [c-\delta, c+\delta]} f(x)\right]2\delta \\
&< \frac{1}{3}\epsilon + \frac{1}{3}\epsilon + 4\delta M \leq \epsilon
\end{aligned}$$

因此 $f$ 在区间 $[a,b]$ 上可积。

最后，我们介绍一个实用的近似定理，下文中 *圆上的函数* 指的是定义的 $\mathbb{R}$ 上的周期为 $2\pi$ 的周期函数

> **Theorem 8.** 设 $f$ 是圆上的可积函数，且 $f$ 以 $B$ 为界，那么存在圆上的连续函数序列 $\left\{f_{k}\right\}_{k=1}^{\infty}$ 使得
> $$\sup _{x \in[-\pi, \pi]}\left|f_{k}(x)\right| \leq B \quad \text { for all } k=1,2, \ldots$$
> 且
> $$\int_{-\pi}^{\pi}\left|f(x)-f_{k}(x)\right| d x \rightarrow 0 \quad \text { as } k \rightarrow \infty$$

证明：对于任意的 $\epsilon>0$，我们选择区间 $[-\pi,\pi]$ 的一个分割 $-\pi=x_{0}<x_{1}<\cdots<x_{N}=\pi$，使得 $f$ 的上界和与下界和之差小于 $\epsilon$，定义 *step function(阶跃函数)*

$$f^{*}(x)=\sup _{x_{j}-1 \leq y \leq x_{j}} f(y) \quad \text { if } x \in\left[x_{j-1}, x_{j}\right) \text { for } 1 \leq j \leq N$$

根据定义，$\left|f^{*}\right| \leq B$，且

$$\int_{-\pi}^{\pi}\left|f^{*}(x)-f(x)\right| d x=\int_{-\pi}^{\pi}\left(f^{*}(x)-f(x)\right) d x<\epsilon\tag{1}$$

现在我们尝试把 $f^{*}$ 改造成一个连续的周期函数，且保持上面的性质。对于足够小的 $\delta>0$，

- 若 $x$ 到任意 $x_{j}$ 的距离都大于 $\delta$，则定义 $\tilde{f}(x)=f^{*}(x)$

- 若 $x$ 到某个 $x_{j}$ 的距离小于 $\delta$，则定义 $\tilde{f}(x)$ 的值为过 $$(x_{j}-\delta,f^{*}(x_{j}-\delta)),(x_{j}+\delta,f^{*}(x_{j}+\delta))$$ 两点的线性函数在 $x$ 处的值

直接看这个定义可能会有一头雾水的感觉，我们画出函数 $f^{*},\tilde{f}$ 的图像就很明确了。

<center><img src="/content-images/external/953fdc9ef6c48e9b35e68dce668698b9.jpg"></center>

根据定义，$\tilde{f}(-\pi)=\tilde{f}(\pi)$，因此我们可以把 $\tilde{f}$ 延拓为 $\mathbb{R}$ 上的周期为 $2\pi$ 的连续函数，其绝对值的上界依然为 $B$.

事实上，$\tilde{f}$ 和 $f^{*}$ 仅在 $N$ 个长度为 $2\delta$ 的区间上的取值不同，因此

$$\int_{-\pi}^{\pi}\left|f^{*}(x)-\tilde{f}(x)\right| d x \leq 4\delta BN$$

调整 $\delta$ 的值足够小，就能得到

$$\int_{-\pi}^{\pi}\left|f^{*}(x)-\tilde{f}(x)\right| d x<\epsilon\tag{2}$$

式子 $(1)(2)$，结合绝对值的 *triangle inequality(三角不等式)*，得到

$$\int_{-\pi}^{\pi}|f(x)-\tilde{f}(x)| d x<2 \epsilon$$

只需要取 $2\epsilon=\frac{1}{k}$，根据相应的 $\delta$ 值求出 $\tilde{f}$ 作为 $f_{k}$，我们发现这样的 $f_{k}$ 就是我们想要的东西。

---

## *2. Sets of Measure Zero(零测度集)*

我们知道，连续函数是可积的，结合 *Theorem 3* 中的 $(4)$，分段连续函数也是可积的，接下来我们要讨论不连续的可积函数。在此之前，我们需要引入零测度集的概念。

> **Definition 9. Measure Zero Set(零测度集).** 若 $\mathbb{R}$ 的子集 $E$ 满足对于任意的 $\epsilon>0$，存在可数的开区间族 $\left\{I_{k}\right\}_{k=1}^{\infty}$ 使得
> 
> - $E \subset \bigcup_{k=1}^{\infty} I_{k}$
> - $\sum_{k=1}^{\infty}\left|I_{k}\right|<\epsilon$，其中 $|I_{k}|$ 表示区间 $I_{k}$ 的长度
> 
> 那么我们称 $E$ 是 *measure zero set(零测度集)*.

这里我们给不熟悉集合论的读者科普一些相关的概念。

- **以集合为元素的集合称为 *family of sets(集族)*，类似的，以开区间为元素的集合称为 *a family of open intervals(开区间族)*. **

- **集合论中，我们把与自然数集等势的集合称为可数集。**

- **在实分析中的 *Lebesgue integration(勒贝格积分)* 中，我们将系统地学习集合的测度理论。**

现在回到零测度集的概念上，我们稍作解释。第一个条件表明我们选择的这族区间 $\left\{I_k\right\}_{k=1}^{\infty}$ 的并集能覆盖集合 $E$，第二个条件则表明这个并集非常的小。

根据定义，我们发现任意有限点集都是零测度集，例如对于 $E = \{1,2,3\}$，只需要选取开区间族 

$$\{I_{k}\} = \{(1-\delta,1+\delta), (2-\delta,2+\delta), (3-\delta,3+\delta)\}$$

即可覆盖集合 $E$，并且取足够小的 $\delta$ 就能满足条件二。

事实上，任意的可数点集都是零测度集，它是下面我们要介绍的这个定理的推论。

> **Theorem 10.** 可数个零测度集的并集是零测度集。

证明：设 $E_{1}, E_{2}, \ldots$ 是零测度集，且 $E=\cup_{i=1}^{\infty} E_{i}$，给定 $\epsilon>0$，对于每个 $i$ 选择开区间族 $I_{i, 1}, I_{i, 2}, \ldots$ 使得

$$E_{i} \subset \bigcup_{k=1}^{\infty} I_{i, k} \quad \text { and } \quad \sum_{k=1}^{\infty}\left|I_{i, k}\right|<\epsilon / 2^{i}$$

那么显然我们有 $E \subset \cup_{i, k=1}^{\infty} I_{i, k}$，且

$$\sum_{i=1}^{\infty} \sum_{k=1}^{\infty}\left|I_{i, k}\right| \leq \sum_{i=1}^{\infty} \frac{\epsilon}{2^{i}} \leq \epsilon$$

接下来再补充一些集合论的知识

- **若对集合中的任意一点，其邻域中的点也都在集合中，那么该集合称为 *open set(开集)*，反之，若一个集合包含其所有的界限点，则该集合称为 *close set(闭集)*，例如：**

$$(-1,2) \rightarrow 开集$$

$$(-\infty,2] \rightarrow 闭集$$

$$(-1,2]\rightarrow 既不是开集，也不是闭集$$

- **有界闭集称为 *compact set(紧集)*，例如：**

$$[-2,4]\rightarrow 紧集$$

$$(-\infty,4]\rightarrow 不是紧集(无下界)$$

$$(-2,4)\rightarrow 不是紧集(不是闭集)$$

现在我们回顾之前讨论的定理，可以得到一个重要的结论，如果 $E$ 是**零测度紧集**，那么能够找到**有限**个开区间 $I_{k}$ 满足定义中的条件。

接下来，我们讨论不连续函数的黎曼可积性

> **Theorem 11. Lebesgue Theorem(勒贝格定理).** 定义在区间 $[a,b]$ 上的有界函数 $f$ 可积，当且仅当 $f$ 的所有不连续点是零测度集。

我们记 $J=[a,b]$，记 $I(c,r)$ 表示以 $c$ 为中心，$r>0$ 为半径的开区间，即

$$I(c,r)=(c-r,c+r)$$

定义函数 $f$ 在区间 $I(c,r)$ 上的 *oscillation(振幅)* 为

$$\operatorname{osc}(f, c, r)=\sup |f(x)-f(y)|$$

其中 $x, y \in J \cap I(c, r)$，由于 $f$ 有界，这个振幅是必定存在的，定义 $f$ 在点 $c$ 的振幅

$$\operatorname{osc}(f, c)=\lim _{r \rightarrow 0} \operatorname{osc}(f, c, r)$$

这个极限值是存在的，因为 $\operatorname{osc}(f,c,r)\geq 0$，且随 $r$ 递减，单调有界函数必定收敛。

从定义可以看出 $f$ 在点 $c$ 连续当且仅当 $\operatorname{osc}(f,c)=0$，对于每一个 $\epsilon>0$，定义集合

$$A_{\epsilon}=\{c \in J: \operatorname{osc}(f, c) \geq \epsilon\}$$

做完这些工作，我们发现 $f$ 在区间 $J$ 上的所有不连续点的集合就是

$$\cup_{\epsilon>0} A_{\epsilon}$$

这是我们证明 *Theorem 11* 的重要一步，接下来的证明需要先证一个引理

> **Lemma 12.** 若 $\epsilon>0$，那么集合 $A_{\epsilon}$ 是紧集。

证明：显然 $A_{\epsilon}$ 有界，只需要证明它是闭集即可，我们使用反证法，假设开集 $c_{n}\subset A_{\epsilon}$ 收敛于边界 $c$ 且 $c\notin A_{\epsilon}$，记

$$\operatorname{osc}(f, c)=\epsilon-\delta,\quad \delta>0$$

选取 $r$ 使得 $\operatorname{osc}(f, c, r)<\epsilon-\frac{\delta}{2}$，选取 $n$ 使得 $\left|c_{n}-c\right|<\frac{r}{2}$，那么

$$\operatorname{osc}\left(f, c_{n}, \frac{r}{2}\right)<\epsilon\Rightarrow \operatorname{osc}\left(f, c_{n}\right)<\epsilon$$

这与 $c_{n}\in A_{\epsilon}$ 矛盾，证毕。

现在我们就可以继续证明 *Theorem 11* 了。

**先证充分性**，若 $f$ 的所有不连续点的集合 $\mathcal{D}$ 是零测度集，设 $\epsilon>0$，由于 $A_{\epsilon}\subset \mathcal{D}$，我们可以用有限多个开区间覆盖 $A_{\epsilon}$，记这族区间为

$$I = I_{1},I_{2},\cdots,I_{N}$$

且这些区间的总长度小于 $\epsilon$，接下来考虑连续的部分，对于连续点 $z\in I^{c}$，我们知道其振幅在该点为 $0$，因此可以取其邻域中的点组成区间 $F_{z}$ 使得

$$\sup _{x, y \in F_z}|f(x)-f(y)| \leq \epsilon$$

我们同样可以选取有限多个开区间来覆盖这些 $F_{z}$ ，记作

$$I^{\prime} = I_{N+1},\cdots, I_{N^{\prime}}$$

现在将开区间族 $I,I^{\prime}$ 的所有端点有序排列，得到一个 $[a,b]$ 的分割 $P$，那么分割中的这些区域要么属于 $I$，要么属于 $I^{\prime}$，因此

$$\mathcal{U}(P, f)-\mathcal{L}(P, f) \leq 2 M \sum_{j=1}^N\left|I_j\right|+\epsilon(b-a) \leq (2M + b -a) \epsilon$$

其中 $M$ 为 $|f|$ 的上界，因此 $f$ 可积。

**再证必要性**，设 $f$ 在 $[a,b]$ 上可积，其不连续点的集合可以表示为

$$\mathcal{D} = \cup_{n=1}^{\infty} A_{\frac{1}{n}}$$

我们只需要证明每个 $A_{\frac{1}{n}}$ 都是零测度集就行了，对于 $\epsilon>0$，取分割 $P = \left\{x_0, x_1, \ldots, x_N\right\}$ 使得

$$\mathcal{U}(P, f)-\mathcal{L}(P, f)<\epsilon / n$$

考虑 $A_{\frac{1}{n}}$ 中的一点 $z$，若 $z\in I_j=\left(x_{j-1}, x_j\right)$，那么

$$\sup _{x \in I_j} f(x)-\inf _{x \in I_j} f(x) \geq \frac{1}{n}$$

也就是说，只要 $A_{\frac{1}{n}}$ 与 $I_{j}$ 有交集，那么在区间 $I_{j}$ 上，函数 $f$ 的上界和与下界和只差至少为 $\frac{1}{n}$，我们统计所有 $I_{j}$ 的贡献，得到

$$\frac{1}{n} \sum_{\left\{j: I_j \cap A_{\frac{1}{n}} \neq \emptyset\right\}}\left|I_j\right| \leq \mathcal{U}(P, f)-\mathcal{L}(P, f)<\epsilon / n$$

那么我们只需要选取和 $A_{\frac{1}{n}}$ 有交集的 $I_{j}$，就能覆盖 $A_{\frac{1}{n}}$，并且 $I_{j}$ 的长度之和小于 $\epsilon$，证毕。

---

## *Reference*

- https://www.bananaspace.org/wiki/%E8%AE%B2%E4%B9%89:%E6%95%B0%E5%AD%A6%E5%88%86%E6%9E%90/Lebesgue_%E5%AE%9A%E7%90%86
