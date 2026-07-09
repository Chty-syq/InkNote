---
type: markdown
title: Beatty Sequence
slug: "2753002"
date: 2023-06-19
updatedAt: 2026-06-29 17:18:18
tags:
  - 数论
published: true
category: mathmatics
---

## *1. Jeffery's Problem*

前日，我司巨佬 *Jeffery* 出了一道难题，以此说明彼强我菜，题目如下

> **Problem 1.** 求下面和式
> $$S(n) = \sum_{i=1}^{n} \left \lfloor i \sqrt{2} \right \rfloor$$ 的值，其中 $n\leq 10^{100}$

看到题目我是一头雾水的，后经提示，原来是一道面向 *google* 编程的结论题。

---

## *2. Beatty Sequence(贝蒂序列)*


> **Theorem 2. Rayleigh's Theorem(瑞利定理).** 设数列 $\{a_{n}\},\{b_{n}\}$ 为
> $$a_{n} = \left \lfloor n \alpha \right \rfloor,\quad b_{n} = \left \lfloor n \beta \right \rfloor$$ 其中 $\alpha,\beta$ 为正无理数，且满足
> $$\frac{1}{\alpha} + \frac{1}{\beta} = 1$$ 则序列 $\{a_{n}\},\{b_{n}\}$ 构成正整数域的一个划分，即
> $$\{a_{n}\}\cap \{b_{n}\} = \varnothing, \quad \{a_{n}\}\cup \{b_{n}\} = \mathbb{Z}^{+}$$ 我们把 $\{a_{n}\},\{b_{n}\}$ 称为 *beatty sequence(贝蒂序列)*.

（1）先证明交集为空，假设 $\exists n_{1},n_{2},k \in \mathbb{Z}^{+}$ 使得

$$\lfloor n_{1} \alpha\rfloor =\lfloor n_{2} \beta \rfloor =k$$

则有

$$\left\{\begin{matrix}
k < n_{1}\alpha < k+1 \\ 
k < n_{2}\beta < k+1
\end{matrix}\right. \Rightarrow \left\{\begin{matrix}
\frac{k}{\alpha} < n_{1} < \frac{k+1}{\alpha} \\ 
\frac{k}{\beta} < n_{2} < \frac{k+1}{\beta}
\end{matrix}\right.$$

相加得到

$$k < n_{1} + n_{2} < k+1$$

由于 $n_{1},n_{2},k \in \mathbb{Z}^{+}$，这不可能成立，因此假设错误，证毕。

（2）再证明并集为 $\mathbb{Z}^{+}$，设序列 

$$\{c_{n}\} = \left\{n\alpha\right\}\cup \left\{n\beta\right\}$$

则命题等价于 $\forall k = 1,2,\ldots$，序列 $\{c_{n}\}$ 中有且仅有一个元素在区间 $(k, k+1)$ 中。

首先序列 $\left\{n\alpha\right\}, \left\{n\beta\right\}$ 是没有相同元素的，这是因为若

$$n_{1}\alpha = n_{2}\beta \Rightarrow \beta= 1 + \frac{n_{1}}{n_{2}}$$

这与 $\beta$ 是无理数矛盾，在此基础上设 $f(k)$ 表示序列 $\{c_{n}\}$ 中小于 $k$ 的元素个数，则显然

$$f(k) = \left\lfloor \frac{k}{\alpha} \right\rfloor + \left\lfloor \frac{k}{\beta} \right\rfloor$$

注: 只有先保证了序列 $\left\{n\alpha\right\}, \left\{n\beta\right\}$ 没有相同元素，才可以这样相加计算。

因此，根据下取整的性质，有

$$\begin{aligned}
f(k) &> \frac{k}{\alpha} - 1 + \frac{k}{\beta} - 1 = k - 2 \\
f(k) &< \frac{k}{\alpha} + \frac{k}{\beta} = k
\end{aligned}$$

由于 $f(k)$ 是整数，因此 $f(k) = k - 1$，所以序列 $\{c_{n}\}$ 中落在区间 $(k, k+1)$ 的元素个数为

$$f(k+1) - f(k) = 1$$

证明完毕，我们的贝蒂序列 $\{a_{n}\},\{b_{n}\}$ 是互补的。

---

## *3. Back to Jeffery's Problem*

有了贝蒂序列的结论后，我们回到 *Jeffery* 的难题中，注意到序列 $\lfloor i \sqrt{2}\rfloor$ 符合贝蒂序列的形式，我们可以写出互补的另一部分，设

$$a_{n} = \lfloor n \sqrt{2}\rfloor, \quad b_{n} = \lfloor n (2 + \sqrt{2})\rfloor$$

那么我们有

$$\sum_{i=1}^{n} a_{i} + \sum_{i=1}^{n^{\prime}} b_{i} = \sum_{i=1}^{n+n^{\prime}} i$$

其中 $n + n^{\prime} = \lfloor n \sqrt{2}\rfloor$，也就是说，我们用 $\{b_{n}\}$ 将 $\{a_{n}\}$ 中缺少的项补充完整，由于 $b_{n} = a_{n} + 2n$，因此有

$$S(n) + S(n^{\prime}) + 2\sum_{i=1}^{n^{\prime}} i = \sum_{i=1}^{n+n^{\prime}} i$$

所以

$$S(n) = \frac{(n+n^{\prime})(n+n^{\prime} + 1)}{2} - n^{\prime}(n^{\prime} + 1) - S(n^{\prime})$$

现在我们就可以递归计算 $S(n)$ 了，由于

$$n^{\prime} = \lfloor n \sqrt{2}\rfloor - n \leq (\sqrt{2} - 1)n$$

所以每递归一次，$n$ 的大小会变为原来的 $0.4$ 左右，复杂度是 $O(\log{n})$ 的。

---

## *Reference*

- https://mathworld.wolfram.com/BeattySequence.html
- https://planetmath.org/proofofbeattystheorem
