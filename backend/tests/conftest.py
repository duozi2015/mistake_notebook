"""测试隔离：测试套件使用独立临时数据库，绝不触碰开发/生产数据。

原因：历史教训 —— 测试模块的 module-scope fixture 会 drop_all 共享库导致真实账号数据丢失。
本文件在 pytest 收集测试模块前执行，将 DATABASE_URL 指向临时文件，
使 app.database 的 engine 绑定到临时库，测试增删改只影响临时库。
"""
import os
import tempfile

_tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_tmp.close()
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp.name}"
