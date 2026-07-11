---
type: markdown
title: Modern CMake
slug: "3646525"
date: 2023-04-17
updatedAt: 2026-07-11 17:51:23
tags:
  - C++
published: true
category: computer-science
---

## *1. Introduction*

在讲 *cmake* 之前，我们先来回顾一下使用命令行的编译方式，*C* 系列语言提供了很多编译器供开发者使用，例如

- GNU 的 *gcc, g++*
- LLVM 的 *clang, clang++*
- 微软的 *SMVC*

我们以常用的 *g++* 为例，假设有两个源文件 *main.cpp* 和 *hello.cpp*，我们使用如下命令

``` bash
g++ -c hello.cpp -o hello.o
g++ -c main.cpp -o main.o
```

将它们编译为临时对象文件 *.o*，这样做的好处是如果 *hello.cpp* 有改动，只需要重新编译它，而不需要重新编译 *main.cpp*

*.o* 文件中存放着对应的汇编代码，使用命令

``` bash
objdump -D hello.o
```

可以查看里面的汇编代码，但是它不是可执行的，我们需要使用

``` bash
g++ main.o hello.o -o main
```

生成最终的可执行文件 *main*，这里有一个问题，为什么要有多个源文件，而不是把所有的代码都放在一个源文件中呢？

1. 把所有的代码写在一个源文件中，就形成了屎山。
2. 当代码有改动时，整个源文件都需要重新编译，工程较大时非常耗时。

按照这样的编译方式，我们发现如果源文件数量很多，我们需要手动维护这些 *.o, .cpp* 文件之间的关系，非常麻烦，于是 *Makefile* 应运而生。 

``` makefile
main: hello.o main.o
    g++ main.o hello.o -o main
    
main.o: main.cpp
    g++ -c main.cpp -o main.o
    
hello.o: hello.cpp
    g++ -c hello.cpp -o hello.o
```

*Makefile* 是一种这样的文件，它维护了编译的依赖关系，我们可以画一个依赖关系图

<center><img src="/content-images/external/a365b3eb84e510ec73961bceb280d5e3.jpg" width=40%>
</center>

当 *main.cpp* 改变时，只需要重新编译上面那条链。

这样的话，我们只需要写一个 *Makefile*，让它帮助我们维护这个关系，但是缺点也很明显

- 不同的编译器有不同的编译命令和编译选项
- 当依赖关系很复杂时，手写 *Makefile* 也是很头疼的
- *Makefile* 语法简单，没有逻辑判断，能做的事很有限

为了解决这些问题，*cmake* 出现了，我们只需要写一份 *CMakeLists.txt* 就可以指定编译器、编译平台和编译选项，自动生成我们需要的 *Makefile* 文件。

---

## *2. Modern CMake*

古代 *cmake* 通常指 *CMake 2.x*，它的编译命令通常是

``` bash
mkdir -p build                              # 新建build文件夹
cd build                                    # 进入build
cmake .. -DCMAKE_BUILD_TYPE=Release         # 在Release模式下生成Makefile
make -j4                                    # 4线程执行编译
make install                                # 将编译好的库加载到系统lib
```

网络上的多数代码还是用的这种编译方式，而现在的 *CMake 3.x* 通常为

``` bash
cmake -B build -DCMAKE_BUILD_TYPE=Release   # 使用Release模式在build文件夹下生成Makefile
cmake --build build --parallel 4            # 4线程执行编译
cmake --build build --target install        # 将编译好的库加载到系统lib
```

通常情况下，*cmake* 的构建分为两步

- *configure(配置阶段)*: 检测系统环境并生成构建规则 *Makefile*
- *build(构建阶段)*: 调用编译器来编译代码

在配置阶段，我们可以通过 `-D` 选项来设置一些缓存变量，例如常用的 `CMAKE_BUILD_TYPE`，它的作用是指定编译模式，具体的作用如下

- 设置优化等级: `[-O0, -O1, -O2, -O3, -Ofast, -Os, -Oz, -Og, -O, -O4]`
- 设置debug日志:  `[-g, -gline-tables-only, -gmodules, -glevel, -gcoff, -gdwarf, -gdwarf-version, -ggdb, -grecord-gcc-switches, -gno-record-gcc-switches, -gstabs, -gstabs+, -gstrict-dwarf, -gno-strict-dwarf, -gcolumn-info, -gno-column-info, -gvms, -gxcoff, -gxcoff+, -gz[=type]]`
- 是否生成assert()代码: `[-DNDEBUG]`
- 是否生成debug代码: `[custom]`

它的可选取值有（通常情况下仅使用 `Release` 和 `Debug`）

- Release:  `-O3 -DNDEBUG`
- Debug: `-O0 -g`
- RelWithDebInfo: `-O2 -g -DNDEBUG`
- MinSizeRel: `-Os -DNDEBUG`

配置阶段使用 `-D` 指定的缓存变量，在构建阶段依然生效。除此之外，我们也可以用 `-G` 选项指定生成的构建规则的后端，默认情况下是 *Makefile*，可以使用

``` bash
cmake -B build -G Ninja
```

手动指定生成 *Ninja* 后端，它的构建速度比 *Makefile* 更快一些。


还是上面那个例子，我们写一份 *CMakeLists.txt*

``` cmake
cmake_minimum_required(VERSION 3.12)
project(hellocmake LANGUAGES CXX)

add_executable(main main.cpp hello.cpp)
```

执行上面的命令就可以编译出我们需要的可执行文件 *main*

---

## *3. Libraries and Headers*

很多时候，我们会把较为底层的基础功能做成库，供其它开发者调用，避免重复造轮子。

*C++* 中的库分为 *static library(静态库)* 与 *shared library(动态库)*，它们的区别在于静态库直接在编译期将代码插入到可执行文件中，而动态库则是在运行时将符号重定向。

静态库的好处在于加载速度快，可执行文件不依赖该库，在编译出可执行文件后，把静态库删掉也不会影响其运行。但是缺点也很明显，可执行文件体积庞大，占用磁盘空间。

动态库的好处在于可扩展性强，库函数的改动不会影响到可执行文件。但是依赖关系强，缺失会导致可执行文件无法连接到相关符号。

在 *cmake* 中，我们可以使用下面的指令来生成库文件

``` cmake
add_library(main STATIC source.cpp)     # 生成静态库main.a
add_library(main SHARED source.cpp)     # 生成动态库main.so
```

*C++* 强烈依赖上下文信息，其变量与函数需要先声明才能使用，这是因为

- 重载和隐式类型转换等特性需要知道参数与返回值的类型。
- 需要区分符号究竟是变量还是函数。

因此，在使用其它源文件或库中的函数时，需要在当前源文件中先进行声明，之后才能使用，当一个库中的函数在多个源文件中调用时，你会发现这个函数在每个源文件中都声明了一遍，太糟心了。

如果能将这些声明只写一遍，然后自动插入到需要使用这些声明的源文件中就好了，这就是 *header(头文件)* 的作用。

``` cpp
#include <cstdio>
#include "cstdio"
```

引入头文件通常有尖括号与双引号两种方式，它们的区别在于

- 尖括号表示不要在当前目录上搜索，仅在系统目录下搜索，这可以避免系统头文件被当前目录下的文件污染，导致运行时错误。
- 双引号表示优先搜索当前目录，找不到再去系统目录下搜索。

---

## *4. Configuration of Targets*

我们的 *C++* 项目进行编译的最终目的通常是生成一个可执行文件或链接库供用户使用，在 *cmake* 中，它们叫做 *target(构建目标)*.

``` cmake
add_executable(main)
add_library(main)
```

这里的 *main* 就是我们的 *target*，首先我们需要指定编译 *target* 所需的源文件，例如

``` cmake
add_executable(main main.cpp hello.cpp)
```

当源文件数量很多时，我们希望能够自动搜索这些源文件，可以使用

``` bash
file(GLOB_RECURSE sources CONFIGURE_DEPENDS ${CMAKE_CURRENT_SOURCE_DIR}/*.cpp)
add_executable(main PUBLIC ${sources})
```

其中 `GLOB_RECURSE` 表示递归查找子目录，`SOURCE` 是用于保存查找结果的变量，它是一个字符串数组。

接下来要为 *target* 指定一些其它的配置，例如

``` bash
target_include_directories(main ${CMAKE_CURRENT_SOURCE_DIR}/include/)   # 添加头文件搜索路径
target_link_libraries(main libs)                                        # 添加链接库
target_compile_features(main std_cxx_14)                                # cpp语言标准
target_compile_definitions(main LogLevel=3)                             # 宏定义
target_compile_options(main -Werror -Wall -Wextra)                      # 编译选项
```

上面这些形如 `target_*` 的指令都只针对我们的目标 *main* 生效，在古代 *cmake* 中，这些指令通常以全局指令的形式存在，会影响到所有的 *target*，例如

``` bash
include_directories(${CMAKE_CURRENT_SOURCE_DIR}/include/)   # 全局头文件搜索路径
link_directories(${CMAKE_CURRENT_SOURCE_DIR}/lib/)          # 全局库文件搜索路径
add_definitions(LogLevel=3)                                 # 全局宏定义
add_compile_options(-Werror -Wall -Wextra)                  # 全局编译选项
```

现在 *cmake* 的一个重要思想就是围绕构建目标 *target* 进行配置，相当于加了个 *namespace*，这样管理起来更加灵活，避免了多个 *taget* 之间相互污染。

在围绕 *target* 进行配置时，可以指定配置的类型：

- `PRIVATE`: 仅在编译时需要满足
- `INTERFACE`: 仅在使用时需要满足，即在其他项目里，使用本项目已编译好的 *target* 时需要满足
- `PUBLIC`: 在编译时和使用时都需要满足

---

## *5. Submodules*

在大型工程里，我们常常需要划分子模块，例如我们有子模块 *submodule1, submodule2,  submodule3*，它下面有它自己的 *CMakeLists.txt*，工程目录长这个样子

```
project 
    |- submodule1
        |- include
            |- AClass.h
            |- BClass.h
        |- src
            |- AClass.cpp
            |- BClass.cpp
        |- CMakeLists.txt
    |- submodule2
    |- submodule3
    |- main.cpp
    |- CMakeLists.txt
```

外层的 *CMakeLists.txt* 如下：

```
add_subdirectory(submodule1)
add_subdirectory(submodule2)
add_subdirectory(submodule3)

add_executable(main main.cpp)
target_link_libraries(main PUBLIC submodule1 submodule2 submodule3)
```

我们使用 `add_subdirectory()` 引入这些子模块，该指令会自动根据 *submodule* 下的 *CMakeLists* 生成子模块的库，并可以在外层用 `target_link_libraries()` 进行链接。

值得一提的是，不管是 *submodule* 里面的 *CMakeLists.txt*，还是外层的，里面的路径名都是相对路径，写起来很方便。

---

## *6. Third-party Libs*

在大型工程里，我们常常要引入别人写好的第三方库，例如我们熟知的

- fmt: 格式化库
- boost: C++扩展程序库
- glfw: OpenGL图形学库
- libigl: 图形学算法库
- opencv: 计算机视觉算法库
- tensorflow: 深度学习库

### *6.1. Import as Submodule*

我们以 *fmt* 这个库为例，我们把它的[源码仓库](https://github.com/fmtlib/fmt)添加到主工程下

``` bash
git submodule add https://github.com/fmtlib/fmt.git
```

然后编写 *CMakeLists.txt* 如下

``` bash
add_subdictory(fmt)

add_executable(main ${sources})
target_link_libraries(main PUBLIC fmt)
target_include_directories(main PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/fmt/include/)  # 引入fmt的头文件
```

就可以把 *fmt* 作为工程的一个子模块引入进来，值得注意的是，我们需要使用  `target_include_directories()` 将子模块的头文件加入到搜索路径中。

对于 *header-only(仅包含头文件)* 的库，例如 *opencv*，就更简单了，只需要 `target_include_directories()` 直接使用头文件就可以了。

### *6.2. Import from System*

我们知道在 *linux* 系统下，可以通过一些包管理工具，例如 *apt, yum, pacman* 等，将第三方库预安装在系统上，当然也可以直接下载源码进行编译安装。

这里强力建议各位卸载手上的 *ubuntu*，它上面的包更新不及时，版本非常古老，建议使用 *arch* 进行 *c++* 开发，*pacman* 上面的包比较新。

对于这些预先安装在系统上的库，*cmake* 可以通过 `find_package()` 指令寻找系统中的库。

我们以 *boost* 库为例，安装方法自行谷歌，使用

```
find_package(Boost 1.46.1 REQUIRED COMPONENTS filesystem system)
if(Boost_FOUND)     # 检查是否找到
    message ("boost found")
else()
    message (FATAL_ERROR "Cannot find Boost")
endif()

add_executable(main main.cpp)
target_link_libraries(main PUBLIC Boost::filesystem)
```

现代 *cmake* 认为一个 *package(库)* 包含很多 *component(组件)*，这里我们引入了 *boost* 库中的 *filesystem, system* 组件，这与命名空间是类似的。 

我们来讲一下 `find_package()` 搜索库目录的原理， 主要有三种搜索模式

- Module模式: 
    - 该模式下，*cmake* 会在 `CMAKE_MODULE_PATH` 下寻找 *Findxxx.cmake* 文件，这个文件负责找到库所在的路径，为我们的项目引入头文件路径和库文件路径
    - `CMAKE_MODULE_PATH` 是一个列表，在 *ubuntu* 下通常为 */usr/share/cmake/Modules/*
- Config模式:
    - 如果 *Module* 模式搜索失败，会进入该模式
    - 该模式下，*cmake* 会在 */usr/local/lib* 下搜索 *xxx-config.cmake* 或 *xxxConfig.cmake* 文件来引入我们需要的库
    - 安装 *cmake* 原生库时，通常会拷贝一份 *xxx-config.cmake* 文件供 `find_package()` 使用
- FetchContent重定向模式:
    - 在 *cmake* 中，可以使用 `FetchContent` 模块将源码从远端下载到本地，然后将库的搜索路径重定向到本地目录
    - 这种模式在下一节中详细说明

### *6.3. Import from Remote*

我们以 *libigl* 为例，说明这种引入方式，这个库的源码仓库在 [https://github.com/libigl/libigl.git](https://github.com/libigl/libigl.git)

我们编写一个 *cmake* 脚本 *libigl.cmake* 如下

``` bash
if(TARGET igl::core)
    return()
endif()

include(FetchContent)
FetchContent_Declare(
    libigl
    GIT_REPOSITORY https://github.com/libigl/libigl.git
    GIT_TAG v2.4.0
)
FetchContent_MakeAvailable(libigl)
```

其中，`FetchContent_Declare` 指定了获取这个库所需的信息，而 `FetchContent_MakeAvailable` 则会在  *configuration* 阶段将库下载到 *build* 文件夹下，并自动调用 `add_subdirectory` 指令将库引入我们的工程。

现在我们的工程目录如下

```
project 
    |- cmake
        |- libigl.cmake
    |- main.cpp
    |- CMakeLists.txt
```

在外层的 *CMakeLists.txt* 中，我们这样写即可

``` bash
# 将cmake目录加入到CMAKE_MODULE_PATH
list(PREPEND CMAKE_MODULE_PATH ${CMAKE_CURRENT_SOURCE_DIR}/cmake) 

include(libigl)         # 引入igl库
igl_include(glfw)       # 引入glfw组件

add_library(main main.cpp)
target_link_libraries(main PUBLIC igl::glfw)
```

---

## *7. Project Properties*

``` bash
cmake_minimum_required(VERSION 3.15)                                # 指定所需cmake最低版本

project(helloworld LANGUAGES C CXX)                                 # 指定工程名

message("PROJECT_NAME: ${PROJECT_NAME}")                            # 项目名称
message("PROJECT_SOURCE_DIR: ${PROJECT_SOURCE_DIR}")                # 当前项目源码目录
message("PROJECT_BINARY_DIR: ${PROJECT_BINARY_DIR}")                # 当前项目输出目录
message("CMAKE_CURRENT_SOURCE_DIR: ${CMAKE_CURRENT_SOURCE_DIR}")    # 根项目源码目录
message("CMAKE_CURRENT_SOURCE_DIR: ${CMAKE_CURRENT_SOURCE_DIR}")    # 根项目输出目录
```

通常情况下，我们使用 `project()` 指令初始化项目，并指定项目名称。这里我们用 `LANGUAGES` 指定支持的语言，通常情况下都是 *C* 和 *CXX*

初始化项目后，将自动生成一些内置变量，我们可以用 `message` 指令打印出它们的值。

注意到 `PROJECT_SOURCE_DIR` 与 `CMAKE_CURRENT_SOURCE_DIR` 在这里是一样的，但是存在子模块时，子模块的这两个变量是不一样的。

在初始化项目之前，我们需要指定 *C++* 标准

``` bash
cmake_minimum_required(VERSION 3.15)

project(helloworld LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)                  # 使用c++17标准 
set(CMAKE_CXX_STANDARD_REQUIRED ON)         # 检测编译器是否支持指定的c++标准
set(CMAKE_CXX_EXTENSIONS OFF)               # 是否启用gcc扩展功能（gcc夹带私货）
```

通常情况下我们是不启用 *gcc* 扩展的，除非该项目只用 *gcc* 进行编译。

百度和 *csdn* 会教我们用 `-std=c++17` 来启用 *c++17* 标准，但这种方法只对 *gcc* 有用，碰到别的编译器就寄了，而且有可能和编译器自带的选项冲突。

---

## *8. Conclusion*

现在我们可以总结出一个较为标准的 *CMakeLists.txt* 模板

``` bash
cmake_minimum_required(VERSION 3.15)

project(helloworld LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17) 
set(CMAKE_CXX_STANDARD_REQUIRED ON)   

if (NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release)
endif()

if (WIN32)
    add_definitions(-DNOMINMAX -D_USE_MATH_DEFINES) 
endif()

add_submodule(submodule1)
add_submodule(submodule2)
add_submodule(submodule3)

file(GLOB_RECURSE sources CONFIGURE_DEPENDS ${CMAKE_CURRENT_SOURCE_DIR}/*.cpp)

add_executable(main PUBLIC ${sources})
target_link_libraries(main PUBLIC submodule1 submodule2 submodule3)
```

由于 windows 系统自带 MINMAX 宏，导致 `std::min`, `std::max` 无法使用，所以我们需要把它取消掉（速速卸载你的 windows）

使用如下命令进行编译

``` bash
cmake -B build -DCMAKE_BUILD_TYPE=Release 
cmake --build build --parallel 4
cmake --build build --target install
```

---

## *9. Reference*

- [官方文档](https://cmake.org/cmake/help/latest/#)
- [彭老师的教程](https://www.bilibili.com/video/BV16P4y1g7MH/?spm_id_from=333.788&vd_source=39b3c15ee891e90bdcf017022f28f8c9)
- https://ukabuer.me/blog/more-modern-cmake/
