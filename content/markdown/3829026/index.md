---
type: markdown
title: Kalman's Filter
slug: "3829026"
date: 2023-04-12
updatedAt: 2026-07-11 17:26:38
tags:
  - 算法
published: true
category: computer-science
---

### *1. Introduction(引入)* 

*Kalman's filter(卡尔曼滤波)* 是一种高效的算法，它能够从一系列包含噪声的测量中，估计动态系统的状态。

在讲具体的算法之前，我们首先通过一个例子来直观的理解一下。

> **Example 1.** 我们使用尺子测量一个硬币的直径，假设它的真实值是 $50mm$，当然我们是不知道这个真实值的。现在我们进行了 $k$ 次测量，设每次测量的结果为 $z_{k}$，一个非常自然的想法是取其均值
> $$\hat{x}_k=\frac{1}{k}\left(z_1+z_2+\cdots+z_k\right)$$ 作为这 $k$ 次测量的估计值，对它进行一些代数变形得到递推形式
> $$\hat{x}_k=\hat{x}_{k-1}+\frac{1}{k}\left(z_k-\hat{x}_{k-1}\right)$$

我们分析一下这个式子

- 当 $k \rightarrow 1$ 时，$\hat{x}_{k} \rightarrow z_{k}$，也就是说当 $k$ 较小时，我们更相信本次的测量值。
- 当 $k \rightarrow \infty$ 时，$\hat{x}_{k} \rightarrow \hat{x}_{k-1}$，也就是说当 $k$ 较大时，新的测量结果就不再重要的。

也就是说，式子里的 $\frac{1}{k}$ 本质上是一个代表权重的系数，它刻画了本次测量值 $z_{k}$ 对估计值 $\hat{x}_k$ 的影响程度，我们使用 $K_{k}\in[0, 1]$ 来推广它，得到

$$\hat{x}_k=\hat{x}_{k-1}+K_{k}\left(z_k-\hat{x}_{k-1}\right)$$

我们知道由于测量仪器的不准确性，每次的测量值 $z_{k}$ 存在 *measurement error(测量误差)*，记作  $e_{\text{MEA}}$

另一方面，我们使用均值来进行估计并不准确，引入了 *estimate error(估计误差)*，记作 $e_{\text{EST}}$

我们并不知道它们的值，但是可以假设它们服从某种概率分布，通常假设误差服从高斯分布，我们有

$$K_k=\frac{e_{\text{EST}}^{(k-1)}}{e_{\text{EST}}^{(k-1)}+e_{\text{MEA}}^{(k)}}$$

这个就是 *Kalman's filter* 的核心公式，我们在后面会详细证明它。


--- 

### *2. Data Fusion(数据融合)*

在上面的例子中，我们仅用一把尺子进行测量，如果测量仪器有多个，我们就需要将它们的测量结果进行 *data fusion(数据融合)*，我们还是用一个例子来说明。

> **Example 2.** 我们使用两个秤来测量某物体的质量，假设它们的误差分别服从高斯分布 
> $$N(0, \sigma_{1}^{2}),  N(0,\sigma_{2}^{2})$$ 现在使用两秤分别得到测量结果 $z_{1},z_{2}$，如何估计物体质量的真实值？

有了 *Example 1* 的经验，我们很自然的想到取

$$\hat{z}=z_1+k\left(z_2-z_1\right)$$

其中，$k\in[0, 1]$，测量值 $z_{1},z_{2}$ 的方差分别为 $\sigma_{1}^{2},\sigma_{2}^{2}$，估计值 $\hat{z}$ 的方差为

$$\begin{aligned} \operatorname{Var}(\hat{z}) 
&=\operatorname{Var}\left(z_1+k\left(z_2-z_1\right)\right)=\operatorname{Var}\left((1-k) z_1+\left.k z_2\right)\right. \\
&=(1-k)^2 \sigma_1^2+k^2 \sigma_2^2
\end{aligned}$$

我们希望取 $k$ 的值使得这个方差最小，即令

$$\frac{d\operatorname{Var}(\hat{z})}{dk} = 2(\sigma_{1}^{2} + \sigma_{2}^{2})k - 2\sigma_{1}^{2}=0$$

得到 $k = \frac{\sigma_1^2}{\sigma_1^2+\sigma_2^2}$，因此使用

$$\hat{z}=z_1+\frac{\sigma_1^2}{\sigma_1^2+\sigma_2^2}\left(z_2-z_1\right)$$

我们就把两秤的测量结果融合在了一起，合并后的误差的方差为

$$\operatorname{Var}(\hat{z}) = \frac{\sigma_1^2 \sigma_{2}^{2}}{\sigma_1^2+\sigma_2^2}$$

---

### *3. State Space Representation(状态空间方程)*

> **Example 3. Mass Spring Damper System(弹簧阻尼系统).** 如图所示
> <center>![enter image description here](/content-images/external/cbaa9dab1c1caeaf5b86bd6d91bd0daa.png)</center> 质量为 $m$ 的物体受随时间 $t$ 变化的外力 $f(t)$ 作用移动，其位移为 $z(t)$，弹簧的弹性系数为 $k$，阻尼系数为 $b$，我们可以写出运动方程
> $$f(t)-b \frac{d z}{d t}-k z(t)=m \frac{d^2 z}{d t^2}$$

对于一个质点系统，我们通常选择其位移 $z(t)$ 和速度 $\dot{z}(t)$ 作为状态变量

$$S = \left[\begin{array}{l}
x_1(t) \\
x_2(t)
\end{array}\right]=\left[\begin{array}{l}
z(t) \\
\dot{z}(t)
\end{array}\right]$$

而系统的输入就是外力 $u = f(t)$，根据运动方程，我们可以表示出 $S$ 随时间的变化

$$\dot{S} = \left[\begin{array}{l}
\dot{x}_1(t) \\
\dot{x}_2(t)
\end{array}\right]=\left[\begin{array}{cc}
0 & 1 \\
-\frac{m}{k} & -\frac{b}{m}
\end{array}\right]\left[\begin{array}{l}
x_1(t) \\
x_2(t)
\end{array}\right]+\left[\begin{array}{c}
0 \\
\frac{1}{m}
\end{array}\right][u(t)]$$

有了这些东西，我们足以确定这个系统每一时刻的状态(系统输出)

$$\left[\begin{array}{l}
y_1(t) \\
y_2(t)
\end{array}\right]=\left[\begin{array}{ll}
1 & 0 \\
0 & 1
\end{array}\right]\left[\begin{array}{l}
x_1(t) \\
x_2(t)
\end{array}\right]$$

这就是弹簧阻尼系统的状态空间方程。

对于一般的线性系统，有系统状态 $S$和外部输入 $u$，系统的输出为 $y$，若系统是时间连续的，其状态空间方程可表示为

$$\left\{\begin{array}{l}
\dot{S}(t) = AS(t) + Bu(t) \\ 
y(t) = HS(t)
\end{array}\right.$$

若系统是离散的，可表示为

$$\left\{\begin{array}{l}
S_{t} = AS_{t-1} + Bu_{t-1} \\ 
y_{t} = HS_{t}
\end{array}\right.$$

---

### *4. Kalman's Filter(卡尔曼滤波)*

我们有一个离散系统，其空间状态方程为

$$\left\{\begin{array}{l}
x_k=A x_{k-1}+B u_{k-1}+w_{k-1} \\ 
y_k=H x_k+v_k
\end{array}\right.$$

其中 $x_{k}\in \mathbb{R}^{n}$ 表示 $k$ 时刻系统的内部状态的真实值，$y_{k}\in \mathbb{R}^{n}$ 表示系统的输出，也是我们的可以观测到的测量值，矩阵 $A,B,H\in \mathbb{R}^{n\times n}$ 为状态转移矩阵。

这里我们引入噪声对系统的影响，用 $w_{k-1}$ 表示系统建模中不可避免的噪声，$v_{k}$ 表示测量系统输出时的测量噪声，假设它们服从高斯分布 

$$w_{k}\sim N(0,Q),\quad v_{k}\sim N(0,R)$$

如果不考虑噪声，我们可以通过状态转移方程得到系统状态的一个估计值

$$\hat{x}_{k}=A \hat{x}_{k-1}+B u_{k-1}$$

以及根据观测到的系统输出 $y_{k}$ 计算出的测量值

$$z_{k}=H^{-1} y_k$$

它们都受到各自噪声的影响，我们需要根据这两个不太准确的数值得到一个相对准确的估计值，考虑对其进行数据融合得到

$$\hat{h}_{k} = \hat{x}_k + G(z_{k} -\hat{x}_k)$$

使用 $K_{k} = GH^{-1}$ 得到与观测值 $y_{k}$ 直接相关的式子

$$\hat{h}_{k} = \hat{x}_k + K_{k}(y_{k} -H\hat{x}_k)$$

我们称 $K_{k}$ 为 *Kalman gain(卡尔曼增益)*，我们需要确定它的值使得 $\hat{h}_{k}$ 尽可能接近真实值 $x_{k}$，按照数据融合的套路计算其协方差

$$\begin{aligned}\operatorname{Cov}(\hat{h}_{k}) 
&= \operatorname{Cov}(K_{k}y_{k} + (I-K_{k}H)\hat{x}_k)\\
&= \operatorname{Cov}(K_{k}y_{k}) + \operatorname{Cov}((I-K_{k}H)\hat{x}_k)
\end{aligned}
$$

> **Lemma 1.** 设有随机向量 $x\in \mathbb{R}^{n}$，以及矩阵 $A\in \mathbb{R}^{n\times n}$，则
> $$\operatorname{Cov}(A x)=A \operatorname{Cov}(x) A^T$$ 证明还是比较简单的
> $$\begin{aligned}\operatorname{Cov}(A x)
&=\mathbb{E}\left[(A x-\mathbb{E}[A x])(A x-\mathbb{E}[A x])^T\right] \\
&=\mathbb{E}\left[(A x-A \mathbb{E}[x])(A x-A \mathbb{E}[x])^T\right] \\
&=\mathbb{E}\left[A(x-\mathbb{E}[x])(x-\mathbb{E}[x])^T A^T\right] \\
&=A \mathbb{E}\left[(x-\mathbb{E}[x])(x-\mathbb{E}[x])^T\right] A^T \\
&= A \operatorname{Cov}(x) A^T
\end{aligned}$$

应用 *Lemma 1* 可以得到

$$\begin{aligned}\operatorname{Cov}(\hat{h}_{k}) 
&= K_{k}\operatorname{Cov}(y_{k})K_{k}^{T} + (I-K_{k}H)\operatorname{Cov}(\hat{x}_k)(I-K_{k}H)^{T}\\
&= \operatorname{Cov}\left(\hat{x}_k\right)-2 K_k H \operatorname{Cov}\left(\hat{x}_k\right)+K_k H \operatorname{Cov}\left(\hat{x}_k\right) H^T K_k^T+K_k \operatorname{Cov}\left(y_k\right) K_k^T
\end{aligned}$$

接下来我们需要分别计算测量值 $y_{k}$ 和估计值 $\hat{x}_{k}$ 的协方差，根据状态转移方程可得

$$\operatorname{Cov}\left(y_k\right) = \operatorname{Cov}\left(Hx_k + v_{k}\right) = \operatorname{Cov}\left(v_k\right) = R$$

而 $\hat{x}_k$ 的表达更为复杂一些，它可以根据上一时刻的系统状态估计值 $\hat{h}_{k-1}$ 递推得到

$$\begin{aligned}\operatorname{Cov}\left(\hat{x}_k\right) 
&= \operatorname{Cov}\left(A\hat{h}_{k-1} + B u_{k-1}+w_{k-1}\right) \\
&= A\operatorname{Cov}\left(\hat{h}_{k-1} \right) A^{T} + Q
\end{aligned}$$
 
注意这里是 $\hat{h}_{k-1}$ 而不是 $\hat{x}_{k-1}$，这是因为我们在上一时刻已经使用观测值 $y_{k-1}$ 进行了数据融合，得到的 $\hat{h}_{k-1}$ 作为上一时刻的估计值。

实际上，我们不关心系统状态之间的依赖关系，我们仅关心各个状态量的方差，因此按照数据融合的流程，我们希望取 $K_{k}$ 使得协方差矩阵的迹

$$tr(\operatorname{Cov}(\hat{h}_{k})) = \sum_{i=1}^{n} \operatorname{Var}(\hat{h}_{k}^{(i)})$$

最小，求其微分得到（参考[矩阵微分学](http://blog.leanote.com/post/chty_syq/Matrix-Calculus)）

$$\begin{aligned}\frac{\partial tr(\operatorname{Cov}(\hat{h}_{k}))}{\partial K_{k}} 
&= \frac{\partial}{\partial K_{k}}  tr[\operatorname{Cov}(\hat{x}_{k}) - 2K_{k}H\operatorname{Cov}(\hat{x}_{k}) + K_{k}H\operatorname{Cov}(\hat{x}_{k})H^{T}K_{k}^{T} + K_k \operatorname{Cov}\left(y_k\right) K_k^T]\\
&= -2\operatorname{Cov}\left(\hat{x}_k\right) H^{T} + 2K_k H \operatorname{Cov}\left(\hat{x}_k\right) H^T + 2K_k \operatorname{Cov}\left(y_k\right)
\end{aligned}$$

令其为 $0$ 得到极小值点

$$K_{k} = \frac{\operatorname{Cov}\left(\hat{x}_k\right) H^T}{H \operatorname{Cov}\left(\hat{x}_k\right) H^T + R}$$

以及对应的协方差的值

$$\operatorname{Cov}\left(\hat{h}_k\right) = (I-K_{k}H)\operatorname{Cov}\left(\hat{x}_k\right)$$

我们简单说一下这个式子是怎么得到的，我们根据 $K_{k}$ 的表达式可以得到

$$ K_{k}H \operatorname{Cov}\left(\hat{x}_k\right) H^T = \operatorname{Cov}\left(\hat{x}_k\right) H^T- K_{k}R$$

注意到左边的表达式出现在 $\operatorname{Cov}\left(\hat{h}_k\right)$ 的第三项中，我们的目标是化繁为简，将其带入得到

$$\operatorname{Cov}\left(\hat{h}_k\right) = \operatorname{Cov}\left(\hat{x}_k\right)-2 K_k H \operatorname{Cov}\left(\hat{x}_k\right) + \operatorname{Cov}\left(\hat{x}_k\right) H^T K_k^T$$

注意到 $\operatorname{Cov}\left(\hat{x}_k\right)$ 是正定的，而 $K_{k}H$ 也是正定的，因此后面两项是一样的，即

$$\operatorname{Cov}\left(\hat{h}_k\right)=\left(I-K_k H\right) \operatorname{Cov}\left(\hat{x}_k\right)$$

现在我们就可以写出 *Kalman's filter* 算法的具体流程了。

> **Method 1. Kalman's Filter(卡尔曼滤波).** 设离散时间系统 $S = (x, y, u, A, B, H)$，其中
> 
- $x \in \mathbb{R}^{n}$ 表示系统的内部状态
- $y \in \mathbb{R}^{n}$ 表示系统的输出，可以被我们观测到
- $u \in \mathbb{R}^{n}$ 表示系统的输入
- $A \in \mathbb{R}^{n\times n}$ 表示 *state transition(状态转移矩阵)*
- $B \in \mathbb{R}^{n\times n}$ 表示 *control(控制矩阵)*
- $H \in \mathbb{R}^{n\times n}$ 表示 *observation(观测矩阵)*
- $w \in \mathbb{R}^{n}$ 表示系统的估计误差，服从高斯分布 $N(0, Q)$
- $v \in \mathbb{R}^{n}$ 表示系统的观测误差，服从高斯分布 $N(0, R)$
- 空间转移方程
> $$\left\{\begin{array}{l}
x_k=A x_{k-1}+B u_{k-1}+w_{k-1} \\ 
y_k=H x_k+v_k
\end{array}\right.$$
> 
> 系统有初始状态 $x_{0}$，卡尔曼滤波算法的流程如下:
> 
> 1. 根据初始状态 $x_{0}$ 确定初始值 $\hat{x}_0, \operatorname{Cov}\left(\hat{x}_{0}\right)$
> 2. 枚举时刻 $k = 1,2,\ldots$
> 3. 计算估计值 $$\hat{x}_k=A \hat{x}_{k-1}+B u_{k-1}$$
> 4. 计算估计值的协方差 $$\operatorname{Cov}\left(\hat{x}_k\right) = A \operatorname{Cov}\left(\hat{h}_{k-1}\right) A^T+Q$$
> 5. 计算卡尔曼增益 $$K_k=\frac{\operatorname{Cov}\left(\hat{x}_k\right) H^T}{H \operatorname{Cov}\left(\hat{x}_k\right) H^T+R}$$
> 6. 进行数据融合 $$\hat{h}_k=\hat{x}_k+K_k\left(y_k-H \hat{x}_k\right)$$
> 7. 更新估计值协方差 $$\operatorname{Cov}\left(\hat{h}_k\right)=\left(I-K_k H\right) \operatorname{Cov}\left(\hat{x}_k\right)$$
> 8. 重复执行直至算法收敛，$\hat{h}_k$ 即为系统状态的最终估计值

---

### *5. Example: Smoothing Key-point Detection(关键点检测的平滑处理)*

[*Mooeli(魔丽)*](https://www.chohotech.com/en.html#/mooeli) 是我们公司的主要产品之一，它为正畸患者提供了自助扫描并监控正畸疗程的服务，使得用户在家里就可以完成牙齿状况的扫描，省下了去医院的时间。

在本 *app* 中，我们使用了很多算法来辅助用户进行口腔扫描，*Key-point Detection(关键点检测)* 算法就是其中之一，如图所示

<center>![enter image description here](/content-images/external/dc4cdc0fe0e107eb7aa6f8df9d275219.jpg)</center>

白色部分是用户的口扫器，我们需要提醒用户进行校准，使得口扫器的中心点位于中央的浅绿色正方形内，因此需要实时检测口扫器中心点的位置。

我们使用一些目标检测算法（例如*YOLO*）来完成对中心点的检测，但是我们发现由于用户的相机时常晃动，因此中心点的位置变化看起来比较紊乱，我们希望对其进行平滑处理。

在这个问题中，我们关心的是中心点的位置 $(x_{0},x_{1})$，以及其移动方向 $(v_{0},v_{1})$，因此设系统状态

$$x = \{x_{0}, x_{1}, v_{0}, v_{1}\}$$

我们可以观测到的系统输出就是当前中心点的位置，以及移动方向(记录上一时刻的位置即可求出)

$$y = \{x_{0},x_{1}, v_{0}, v_{1}\}$$

本系统没有外部输入，假设移动速度为 $0.3$，则空间状态方程为

$$\left\{\begin{array}{l}
x_k=\left[\begin{array}{ll}
1 & 0 & 0.3 & 0 \\
0 & 1 & 0 & 0.3 \\
0 & 0 & 1 & 0 \\
0 & 0 & 0 & 1 
\end{array}\right] x_{k-1}+w_{k-1} \\
y_k= \left[\begin{array}{ll}
1 & 0 & 0 & 0 \\
0 & 1 & 0 & 0 \\
0 & 0 & 1 & 0\\
0 & 0 & 0 & 1
\end{array}\right]x_k+v_k
\end{array}\right.$$

噪声的协方差矩阵为一个对角阵，而方向的变化相对小一些，这里我们取

$$\operatorname{Cov}(w) =\left[\begin{array}{llll}
1e-2 & 0 & 0 & 0 \\
0 & 1e-2 & 0 & 0 \\
0 & 0 & 1e-4 & 0 \\
0 & 0 & 0 & 1e-4
\end{array}\right]$$

$$\operatorname{Cov}(v) =\left[\begin{array}{llll}
0.3 & 0 & 0 & 0 \\
0 & 0.3 & 0 & 0 \\
0 & 0 & 0.1 & 0 \\
0 & 0 & 0 & 0.1
\end{array}\right]$$

使用 *Kalman's filter* 算法可以求得较为稳定的中心点位置的估计值，*opencv* 提供了这个算法，其原型类

``` cpp
class CV_EXPORTS_W KalmanFilter
{
public:    
    CV_WRAP KalmanFilter();
    CV_WRAP KalmanFilter(int dynamParams, int measureParams, int controlParams=0, int type=CV_32F);
    
    //初始化方法
    //dynamParams: 系统状态的数量
    //measureParams: 系统观测值的数量
    //controlParams: 外部输入值的数量
    void init(int dynamParams, int measureParams, int controlParams=0, int type=CV_32F);
  
    CV_WRAP const Mat& predict(const Mat& control=Mat());   //计算状态的估计值
    CV_WRAP const Mat& correct(const Mat& measurement);     //投喂新的测量值，更新状态
 
    Mat statePre;            //估计值 x(k)
    Mat statePost;           //修正估计值 h(k)
    Mat transitionMatrix;    //状态转移矩阵 A
    Mat controlMatrix;       //控制矩阵 B 
    Mat measurementMatrix;   //测量矩阵 H
    Mat processNoiseCov;     //系统误差的协方差 Q
    Mat measurementNoiseCov; //测量误差的协方差 R
    Mat errorCovPre;         //估计值的协方差 Cov(x(k))
    Mat gain;                //卡尔曼增益 K(k)
    Mat errorCovPost;        //修正估计值的协方差 Cov(h(k))
};
```

我们调用这个类就可以完成对中心点检测的平滑处理了。

事实上，*Kalman's filter* 算法常常用来处理变化不稳定的量，在这个例子中就是飘忽不定的中心点。

在最近的开发中，我们发现外部相机的电量变化也是不太稳定的，我们正在考虑用这个算法来处理电量的变化，使其更加平滑。


---

### *6. Reference*

- [Lecture Video](https://www.bilibili.com/video/BV1hC4y1b7K7/?spm_id_from=333.788&vd_source=39b3c15ee891e90bdcf017022f28f8c9)
- [Lecture Note](https://blog.csdn.net/py431382/article/details/109854357)
- [Mass Spring Damper System](https://cookierobotics.com/008/)
