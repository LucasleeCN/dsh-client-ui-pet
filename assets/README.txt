把宠物 JPG 放到这个目录：

    assets/<宠物英文id>/
      idle.jpg        ← 必填，主图（所有状态都用它）
      typing.jpg      ← 可选，按状态覆盖
      thinking.jpg
      working.jpg
      done.jpg
      error.jpg
      happy.jpg
      eat.jpg
      play.jpg
      sleep.jpg

状态名：idle / typing / thinking / working / done / error / happy / eat / play / sleep。
缺省的状态自动回退到 idle.jpg。

之后运行（把 <宠物英文id> 换成真实名字）：

    python scripts/make-raster-pet.py assets/<宠物英文id> --name "宠物中文名" --remove-bg

生成的 WebP 会写回 assets/<宠物英文id>/，并输出可导入的宠物定义 JSON。
背景不是纯色时加 --keep-background（图片将按圆角卡片方式展示）。

注意：原始大图（*.png / *.jpg）默认不进 Git 和 npm 包（体积大），
本机保留即可随时重新生成；仓库里只发布压缩后的 WebP 与定义 JSON。
