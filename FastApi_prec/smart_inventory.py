# smart_inventory.py
from fastapi import FastAPI, Request, Form, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, String, Text, Numeric
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import uvicorn
import os

# --- DB setup (SQLite for simplicity) ---
BASE_DIR = os.path.dirname(__file__)
DB_URL = f"sqlite:///{os.path.join(BASE_DIR, 'dev.db')}"
engine = create_engine(DB_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)
Base = declarative_base()

class Product(Base):
    __tablename__ = "products"
    id = Column(Integer, primary_key=True, index=True)
    sku = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, index=True, nullable=False)
    description = Column(Text, nullable=True)
    price = Column(Numeric(10,2), nullable=False)

Base.metadata.create_all(bind=engine)

# --- Tiny Trie for autocomplete ---
class TrieNode:
    def __init__(self):
        self.children = {}
        self.ids = set()
        self.is_end = False

class Trie:
    def __init__(self):
        self.root = TrieNode()

    def insert(self, word: str, pid: int):
        node = self.root
        for ch in word.lower():
            if ch not in node.children:
                node.children[ch] = TrieNode()
            node = node.children[ch]
            node.ids.add(pid)
        node.is_end = True

    def remove(self, word: str, pid: int):
        # naive removal of id from nodes on the path
        node = self.root
        for ch in word.lower():
            if ch not in node.children:
                return
            node = node.children[ch]
            if pid in node.ids:
                node.ids.remove(pid)

    def search_ids(self, prefix: str, limit: int = 10):
        node = self.root
        for ch in prefix.lower():
            if ch not in node.children:
                return []
            node = node.children[ch]
        return list(node.ids)[:limit]

PRODUCT_TRIE = Trie()

# load existing products into trie at startup
def load_trie():
    db = SessionLocal()
    try:
        prods = db.query(Product).all()
        for p in prods:
            PRODUCT_TRIE.insert(p.name, p.id)
    finally:
        db.close()

# --- Pydantic schemas for API ---
class ProductCreate(BaseModel):
    sku: str
    name: str
    description: str | None = None
    price: float

# --- FastAPI app ---
app = FastAPI()
load_trie()

# serve a tiny static bundle if needed (not required here)
# app.mount("/static", StaticFiles(directory="static"), name="static")

# Home page: simple HTML UI to visualize list/create/search
@app.get("/", response_class=HTMLResponse)
def homepage():
    html = """
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8"/>
        <title>Smart Inventory — Demo</title>
        <style>
          body{font-family: Arial; max-width:900px;margin:30px}
          input,button{padding:8px;margin:4px}
          .card{border:1px solid #ddd;padding:10px;margin:6px;border-radius:6px}
        </style>
      </head>
      <body>
        <h1>Smart Inventory — Demo</h1>

        <h2>Create product</h2>
        <form id="createForm">
          SKU: <input name="sku" required /> 
          Name: <input name="name" required />
          Price: <input name="price" required type="number" step="0.01" />
          <button type="submit">Create</button>
        </form>

        <h2>Search (autocomplete)</h2>
        <input id="q" placeholder="type product name..." />
        <ul id="hits"></ul>

        <h2>Products</h2>
        <div id="list"></div>

        <script>
          async function loadList(){
            const res = await fetch('/api/products');
            const json = await res.json();
            const list = document.getElementById('list');
            list.innerHTML = '';
            json.forEach(p=>{
              const div = document.createElement('div');
              div.className='card';
              div.innerHTML = `<b>${p.name}</b> (SKU: ${p.sku}) — ₹${p.price}<br>${p.description||''}`;
              list.appendChild(div);
            });
          }
          document.getElementById('createForm').addEventListener('submit', async (e)=>{
            e.preventDefault();
            const fd = new FormData(e.target);
            const body = {
              sku: fd.get('sku'),
              name: fd.get('name'),
              price: parseFloat(fd.get('price')),
            };
            const resp = await fetch('/api/products', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)});
            if(resp.ok){ loadList(); e.target.reset(); alert('Created') } else { alert('Create failed') }
          });

          const qin = document.getElementById('q');
          const hits = document.getElementById('hits');
          qin.addEventListener('input', async ()=>{
            const q = qin.value.trim();
            hits.innerHTML = '';
            if(!q) return;
            const r = await fetch('/api/autocomplete?q='+encodeURIComponent(q));
            const j = await r.json();
            for(const id of j.ids){
              const li=document.createElement('li');
              // fetch product to show name
              const pr = await fetch('/api/products/'+id);
              if(pr.ok){
                const pd = await pr.json();
                li.textContent = pd.name + ' (SKU: '+pd.sku+')';
              } else {
                li.textContent = 'id:'+id;
              }
              hits.appendChild(li);
            }
          });

          // load list on page open
          loadList();
        </script>
      </body>
    </html>
    """
    return HTMLResponse(html)

# --- API endpoints ---
@app.post("/api/products")
def api_create_product(payload: ProductCreate):
    db = SessionLocal()
    try:
        # uniqueness check for SKU
        exists = db.query(Product).filter(Product.sku == payload.sku).first()
        if exists:
            raise HTTPException(status_code=400, detail="SKU already exists")
        p = Product(sku=payload.sku, name=payload.name, description=payload.description, price=payload.price)
        db.add(p)
        db.commit()
        db.refresh(p)
        PRODUCT_TRIE.insert(p.name, p.id)
        return {"id": p.id, "sku": p.sku, "name": p.name, "price": float(p.price)}
    finally:
        db.close()

@app.get("/api/products")
def api_list_products():
    db = SessionLocal()
    try:
        prods = db.query(Product).order_by(Product.id.desc()).all()
        return [{"id":p.id,"sku":p.sku,"name":p.name,"description":p.description,"price":float(p.price)} for p in prods]
    finally:
        db.close()

@app.get("/api/products/{pid}")
def api_get_product(pid: int):
    db = SessionLocal()
    try:
        p = db.query(Product).filter(Product.id==pid).first()
        if not p:
            raise HTTPException(status_code=404, detail="Not found")
        return {"id":p.id,"sku":p.sku,"name":p.name,"description":p.description,"price":float(p.price)}
    finally:
        db.close()

@app.get("/api/autocomplete")
def api_autocomplete(q: str):
    ids = PRODUCT_TRIE.search_ids(q, limit=10)
    return JSONResponse({"ids": ids})

# simple delete (and update trie)
@app.delete("/api/products/{pid}")
def api_delete_product(pid: int):
    db = SessionLocal()
    try:
        p = db.query(Product).filter(Product.id==pid).first()
        if not p:
            raise HTTPException(status_code=404)
        db.delete(p)
        db.commit()
        PRODUCT_TRIE.remove(p.name, p.id)
        return {"deleted": pid}
    finally:
        db.close()

# run with: uvicorn smart_inventory:app --reload
if __name__ == "__main__":
    uvicorn.run("smart_inventory:app", host="127.0.0.1", port=8000, reload=True)
