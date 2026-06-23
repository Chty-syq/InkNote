---
type: markdown
title: Quartic Equation
slug: 3161330
date: 2023-09-21
updatedAt: 2026-06-23 14:40:31
tags:
  - 基础数学
published: false
category: mathmatics
---

## *1. Cubic Equation(三次方程)*

对于实系数一元三次方程

$$ax^{3} + bx^{2} + cx + d = 0, \quad a\neq 0$$

我们可以通过换元 $x = y - \frac{b}{3a}$ 消去二次项，得到

$$y^{3} + 3py + 2q = 0$$

其中

$$p=\frac{c}{3 a}-\frac{b^2}{9 a^2}, \quad q=\frac{d}{2 a}+\frac{b^3}{27 a^3}-\frac{b c}{6 a^2}$$

接下来，令 $y = t - \frac{p}{t}$，得到

$$t^{6} + 2q t^{3} - p^{3} = 0$$

这是一个以 $t^{3}$ 为元的二次方程，有判别式 $\Delta = p^{3} + q^{2}$，可以解得

$$t = \sqrt[3]{-q \pm \sqrt{\Delta}}$$

这里复数开三次方会引入三次单位根

$$\omega = \cos\frac{2\pi}{3} + \sin\frac{2\pi}{3} i =-\frac{1}{2}+\frac{\sqrt{3}}{2} i$$

因此我们实际上得到的是三个解

$$t_{1} = t, \quad t_{2} = \omega t, \quad t_{3}= \omega^{2}t$$

以及对应的方程的三个根

$$y_{1} = \sqrt[3]{-q + \sqrt{\Delta}} + \sqrt[3]{-q - \sqrt{\Delta}}$$

$$y_{2} = \omega\sqrt[3]{-q + \sqrt{\Delta}} + \omega^{2}\sqrt[3]{-q - \sqrt{\Delta}}$$

$$y_{3} = \omega^{2}\sqrt[3]{-q + \sqrt{\Delta}} + \omega\sqrt[3]{-q - \sqrt{\Delta}}$$

代回去就能得到原方程的所有复数根，接下来我们讨论实数根的情况

- 当 $\Delta > 0$ 时，方程仅有一个实根

$$y_{1} = \sqrt[3]{-q + \sqrt{\Delta}} + \sqrt[3]{-q - \sqrt{\Delta}}$$

- 当 $\Delta = 0$ 时，方程有两个实根

$$y_{1} = -2 \sqrt[3]{q}$$

$$y_{2} = y_{3} = \sqrt[3]{q}$$

- 当 $\Delta < 0$ 是，方程有三个实根，此时 $p < 0$ 且

$$t = \sqrt[3]{-q+i\sqrt{-\Delta}}$$

令复数 $z = -q + i\sqrt{-\Delta}$，对应的幅角为 $\theta$，则 

$$||z|| = \sqrt{q^{2} - \Delta} = \sqrt{-p^{3}}, \quad \cos\theta = -\frac{q}{p\sqrt{-p}}$$

据此，我们进行复数的开三次根操作得到

$$t = \sqrt[3]{||z||} (\cos\frac{\theta}{3} + i \sin\frac{\theta}{3}) = \sqrt{-p} (\cos\alpha + i \sin\alpha)$$

$$-\frac{p}{t} = \sqrt{-p} (\cos\alpha - i \sin\alpha)$$

其中 $\alpha = \frac{1}{3}\theta = \frac{1}{3}\arccos{(\frac{-q\sqrt{-p}}{p^{2}})}$，代回去得到

$$\begin{aligned}
& y_1=2 \sqrt{-p} \cos \alpha \\
& y_2=2 \sqrt{-p} \cos \left(\alpha+\frac{2\pi}{3}\right) \\
& y_3=2 \sqrt{-p} \cos \left(\alpha+\frac{4\pi}{3}\right)
\end{aligned}$$

注意，以上的复数运算主要运用了复数乘法的计算法则，即

$$复数相乘 = 模长相乘 \&\& 幅角相加$$

最后将解出来的 $y$ 代回 $x = y - \frac{b}{3a}$ 就能得到初始方程的解。

``` cpp
void equation::SolveCubicReal(const vector<double>& coefficients, vector<double> &roots) { //ax^3 + bx^2 + cx + d = 0
    const double a = coefficients[0];
    const double b = coefficients[1];
    const double c = coefficients[2];
    const double d = coefficients[3];
    const double p = (c / a - b * b / (3. * a * a)) / 3.;
    const double q = (d / a + 2. * b * b * b / (27. * a * a * a) - b * c / (3. * a * a)) / 2.;
    const double diff = -b / (3. * a);
    const double discriminant = q * q + p * p * p;
    if (discriminant > 0) { //一个根
        const double y = cbrt(sqrt(discriminant) - q) + cbrt(-sqrt(discriminant) - q);
        roots.push_back(y);
    }
    else if (discriminant == 0) { //两个根
        const double y1 = -2. * cbrt(q);
        const double y2 = cbrt(q);
        roots.insert(roots.end(), { y1, y2 });
    }
    else { //三个根
        const double alpha = acos(-q * sqrt(-p) / (p * p)) / 3.;
        const double y1 = 2. * sqrt(-p) * cos(alpha);
        const double y2 = 2. * sqrt(-p) * cos(alpha + 2. * PI / 3.);
        const double y3 = 2. * sqrt(-p) * cos(alpha + 4. * PI / 3.);
        roots.insert(roots.end(), { y1, y2, y3 });
    }
    for(auto &root: roots)  root += diff;
}
```

---

## *2. Quartic Equation(四次方程)*

终于到我们的正菜了，对于实系数一元四次方程

$$ax^{4} + bx^{3} + cx^2 + dx + e = 0, \quad a\neq 0$$

为了计算方便，不妨设 $a = 1$，经过一波配方可以得到

$$x^4+b x^3+\frac{b^2}{4} x^2=\frac{b^2}{4} x^2-c x^2-d x-e$$

$$\left(x^2+\frac{b}{2} x\right)^2=\left(\frac{b^2}{4}-c\right) x^2-d x-e$$

我们希望右边的式子也是一个完全平方式，这样就可以直接开方，为此，引入自由项 $y$ 得到

$$\begin{aligned}
\left(x^2+\frac{b}{2} x+\frac{y}{2}\right)^2 & =\left(x^2+\frac{b}{2} x\right)^2+y\left(x^2+\frac{b}{2} x\right)+\frac{y^2}{4} \\
& =\left(\frac{b^2}{4}-c\right) x^2-d x-e+y\left(x^2+\frac{b}{2} x\right)+\frac{y^2}{4} \\
& =\left(\frac{b^2}{4}-c+y\right) x^2+\left(\frac{b y}{2}-d\right) x+\frac{y^2}{4}-e
\end{aligned}$$

欲使右边是完全平方式，需要满足

$$\Delta = \left(\frac{b y}{2}-d\right)^2-4\left(\frac{b^2}{4}-c+y\right)\left(\frac{y^2}{4}-e\right)=0$$

即我们需要求解一元三次方程

$$y^3-c y^2+(b d-4 e) y+4 c e-b^2 e-d^2 = 0$$

我们知道三次方程至少有一个实根，我们从里面任选一个作为自由项 $y$ 的值，然后就可以进行愉快的配方了

$$\left(x^2+\frac{b}{2} x+\frac{y}{2}\right)^2=(M x+N)^2$$

其中

$$M = \sqrt{\frac{b^{2}}{4} - c + y}, \quad N = \frac{by - 2d}{4M}$$

两边开方得到两个二次方程

$$x^2+\left(\frac{b}{2} - M\right) x+\frac{y}{2}-N=0$$

$$x^2+\left(\frac{b}{2} + M\right) x+\frac{y}{2}+N=0$$

分别解之就可以得到原方程的 $4$ 个根。

``` cpp
void equation::SolveQuadraticReal(const vector<double>& coefficients, vector<double> &roots) { //ax^2 + bx + c = 0
    const double a = coefficients[0];
    const double b = coefficients[1];
    const double c = coefficients[2];
    const double discriminant = b * b - 4.0f * a * c;
    if (discriminant < 0)  return;  //无解
    roots.push_back((-b - sqrt(discriminant)) / (2. * a));
    roots.push_back((-b + sqrt(discriminant)) / (2. * a));
}

void equation::SolveQuarticReal(const vector<double>& coefficients, vector<double> &roots) { //ax^4 + bx^3 + cx^2 + dx + e = 0
    const double a = coefficients[0];
    const double b = coefficients[1] / a;
    const double c = coefficients[2] / a;
    const double d = coefficients[3] / a;
    const double e = coefficients[4] / a;

    vector<double> roots_y;
    SolveCubicReal({ 1., -c, b * d - 4. * e, 4. * c * e - b * b * e - d * d }, roots_y);
    const double y = roots_y[0];

    const double m = sqrt(b * b / 4. - c + y);
    const double n = (b * y / 2. - d) / (2. * m);

    SolveQuadraticReal({ 1., b / 2. + m, y / 2. + n }, roots);
    SolveQuadraticReal({ 1., b / 2. - m, y / 2. - n }, roots);
}

```


---

## *Reference*

- [https://blog.csdn.net/he_nan/article/details/78069950](https://blog.csdn.net/he_nan/article/details/78069950)
- [https://zhuanlan.zhihu.com/p/71014482](https://zhuanlan.zhihu.com/p/71014482)
- [https://zhuanlan.zhihu.com/p/137077558](https://zhuanlan.zhihu.com/p/137077558)
- [http://www.mathsgreat.com/alg/alg_009.pdf](http://www.mathsgreat.com/alg/alg_009.pdf)
