"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

// --- 型別定義 ---
type Vendor = {
  id: string;
  name: string;
  phone?: string;
  note?: string;
};

type MenuItem = {
  id: string;
  vendor_id: string;
  name: string;
  price: number;
};

export default function MenuTab() {
  // --- 商家與菜單狀態 ---
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [menus, setMenus] = useState<MenuItem[]>([]);
  const [expandedVendor, setExpandedVendor] = useState(""); // 手風琴展開狀態
  
  // 新增商家表單
  const [vendorName, setVendorName] = useState("");
  const [vendorPhone, setVendorPhone] = useState("");
  const [vendorNote, setVendorNote] = useState("");
  
  // 菜單輸入暫存 (以商家 ID 為 Key)
  const [menuInputs, setMenuInputs] = useState<{ [vendorId: string]: { name: string; price: string; }; }>({});
  const [editingMenu, setEditingMenu] = useState<{ vendorId: string; menuId: string } | null>(null);

  // --- 生命週期 ---
  useEffect(() => {
    fetchVendors();
    fetchMenus();
  }, []);

  // --- 資料抓取 ---
  const fetchVendors = async () => {
    const { data } = await supabase.from("vendors").select("*").order("created_at");
    setVendors(data || []);
  };

  const fetchMenus = async () => {
    const { data } = await supabase.from("menus").select("*").order("created_at");
    setMenus(data || []);
  };

  // --- 商家操作 ---
  const addVendor = async () => {
    const cleanName = vendorName.trim();
    if (!cleanName) { alert("請輸入商家名稱"); return; }
    
    const { error } = await supabase.from("vendors").insert([
      { name: cleanName, phone: vendorPhone, note: vendorNote }
    ]);
    
    if (error) { alert("新增失敗"); return; }
    
    setVendorName(""); setVendorPhone(""); setVendorNote("");
    fetchVendors();
  };

  const deleteVendor = async (id: string) => {
    if (!confirm("確定刪除商家？這將導致歷史訂單可能找不到商家資訊。")) return;
    await supabase.from("vendors").delete().eq("id", id);
    fetchVendors();
  };

  // --- 菜單操作 ---
  const addMenu = async (vendorId: string) => {
    const input = menuInputs[vendorId];
    if (!input?.name || !input?.price) { alert("請填寫菜名與價格"); return; }
    const price = parseInt(input.price, 10);
    if (!Number.isFinite(price) || price <= 0) { alert("請輸入正確價格"); return; }

    if (editingMenu?.vendorId === vendorId) {
      const { error } = await supabase
        .from("menus")
        .update({ name: input.name.trim(), price })
        .eq("id", editingMenu.menuId);

      if (error) { alert(error.message); return; }

      setEditingMenu(null);
      setMenuInputs((prev) => ({ ...prev, [vendorId]: { name: "", price: "" } }));
      fetchMenus();
      return;
    }

    const { error } = await supabase.from("menus").insert([
      { vendor_id: vendorId, name: input.name.trim(), price },
    ]);
    
    if (error) { alert(error.message); return; }

    setMenuInputs((prev) => ({ ...prev, [vendorId]: { name: "", price: "" } }));
    fetchMenus();
  };

  const editMenuItem = (menu: MenuItem) => {
    setExpandedVendor(menu.vendor_id);
    setEditingMenu({ vendorId: menu.vendor_id, menuId: menu.id });
    setMenuInputs((prev) => ({
      ...prev,
      [menu.vendor_id]: { name: menu.name, price: String(menu.price) },
    }));
  };

  const cancelEditMenu = (vendorId: string) => {
    setEditingMenu(null);
    setMenuInputs((prev) => ({ ...prev, [vendorId]: { name: "", price: "" } }));
  };

  const deleteMenuItem = async (id: string) => {
    if (!confirm("確定要刪除此餐點嗎？")) return;
    await supabase.from("menus").delete().eq("id", id);
    fetchMenus();
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* 頂部：新增商家區域 */}
      <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-slate-200">
        <h2 className="text-3xl font-black text-slate-900 mb-6">商家與菜單管理</h2>
        <div className="flex flex-wrap gap-4 bg-slate-50 p-6 rounded-2xl border border-slate-100">
          <input 
            value={vendorName} 
            onChange={(e) => setVendorName(e.target.value)} 
            placeholder="新商家名稱" 
            className="flex-1 min-w-[200px] border-none px-6 py-4 rounded-xl font-bold outline-none focus:ring-2 focus:ring-blue-500 shadow-sm" 
          />
          <input 
            value={vendorPhone} 
            onChange={(e) => setVendorPhone(e.target.value)} 
            placeholder="商家電話" 
            className="flex-1 min-w-[150px] border-none px-6 py-4 rounded-xl font-bold outline-none focus:ring-2 focus:ring-blue-500 shadow-sm" 
          />
          <input 
            value={vendorNote} 
            onChange={(e) => setVendorNote(e.target.value)} 
            placeholder="備註 (如：地址)" 
            className="flex-1 min-w-[200px] border-none px-6 py-4 rounded-xl font-bold outline-none focus:ring-2 focus:ring-blue-500 shadow-sm" 
          />
          <button onClick={addVendor} className="bg-slate-900 text-white px-8 py-4 rounded-xl font-black shadow-md hover:bg-black transition">
            ＋ 新增商家
          </button>
        </div>
      </div>

      {/* 列表：商家手風琴 */}
      <div className="space-y-4">
        {vendors.length === 0 ? (
          <p className="text-center text-slate-400 font-bold py-10 italic">尚未新增任何商家</p>
        ) : 
          vendors.map((vendor) => {
            const isExpanded = expandedVendor === vendor.id;
            return (
              <div key={vendor.id} className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-200 transition-all hover:shadow-md">
                {/* 商家 Header */}
                <div onClick={() => setExpandedVendor(isExpanded ? "" : vendor.id)} className="flex justify-between items-center cursor-pointer group">
                  <div>
                    <p className="font-black text-2xl text-slate-800 group-hover:text-blue-600 transition">{vendor.name}</p>
                    <div className="flex gap-4 mt-2 text-sm text-slate-500 font-bold">
                      {vendor.phone && <span>📞 {vendor.phone}</span>}
                      <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded-md">🍱 {menus.filter((m) => m.vendor_id === vendor.id).length} 道菜</span>
                    </div>
                    {vendor.note && <p className="text-slate-400 mt-1 text-sm font-medium">{vendor.note}</p>}
                  </div>
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={(e) => { e.stopPropagation(); deleteVendor(vendor.id); }} 
                      className="bg-red-50 text-red-500 hover:bg-red-500 hover:text-white px-5 py-2.5 rounded-xl font-black text-sm transition"
                    >
                      刪除商家
                    </button>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center bg-slate-100 text-slate-400 font-bold transition-transform ${isExpanded ? "rotate-180" : ""}`}>
                      ▼
                    </div>
                  </div>
                </div>
                
                {/* 展開後的菜單管理 */}
                {isExpanded && (
                  <div className="grid md:grid-cols-2 gap-8 mt-8 pt-6 border-t border-slate-100 animate-in slide-in-from-top-2">
                    {/* 左側：現有菜單 */}
                    <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 shadow-inner">
                      <h4 className="font-black text-slate-700 mb-4 border-b border-slate-200 pb-2 flex justify-between">
                        <span>現有菜單</span>
                      </h4>
                      <div className="space-y-3">
                        {menus.filter((menu) => menu.vendor_id === vendor.id).length === 0 ? (
                          <p className="text-slate-400 text-sm italic py-4">目前無餐點，請從右側新增</p>
                        ) : (
                          menus.filter((menu) => menu.vendor_id === vendor.id).map((menu) => (
                            <div key={menu.id} className="flex justify-between items-center bg-white px-5 py-3 rounded-xl shadow-sm border border-slate-100 hover:border-blue-200 transition">
                              <span className="font-bold text-slate-700">{menu.name}</span>
                              <div className="flex items-center gap-4">
                                <span className="text-blue-600 font-black text-lg">${menu.price}</span>
                                <div className="flex gap-2">
                                   <button onClick={() => editMenuItem(menu)} className="text-slate-400 hover:text-blue-600 font-bold text-xs bg-slate-50 px-2 py-1 rounded">編輯</button>
                                   <button onClick={() => deleteMenuItem(menu.id)} className="text-slate-400 hover:text-red-500 font-bold text-xs bg-slate-50 px-2 py-1 rounded">刪除</button>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* 右側：新增餐點表單 */}
                    <div className="bg-blue-50/50 rounded-2xl p-6 border border-blue-100">
                      <div className="mb-4 flex items-center justify-between border-b border-blue-200 pb-2">
                        <h4 className="font-black text-blue-800">{editingMenu?.vendorId === vendor.id ? "編輯餐點" : "＋ 新增餐點"}</h4>
                        {editingMenu?.vendorId === vendor.id && (
                          <button onClick={() => cancelEditMenu(vendor.id)} className="rounded-lg bg-white px-3 py-1 text-xs font-black text-slate-500 hover:bg-slate-100">
                            取消編輯
                          </button>
                        )}
                      </div>
                      <div className="space-y-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest ml-1">餐點名稱</label>
                          <input 
                            value={menuInputs[vendor.id]?.name || ""} 
                            onChange={(e) => setMenuInputs((prev) => ({ ...prev, [vendor.id]: { name: e.target.value, price: prev[vendor.id]?.price || "" } }))} 
                            placeholder="如：排骨便當" 
                            className="w-full border-none px-5 py-4 rounded-xl font-bold shadow-sm outline-none focus:ring-2 focus:ring-blue-500" 
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest ml-1">售價</label>
                          <input 
                            type="number" 
                            value={menuInputs[vendor.id]?.price || ""} 
                            onChange={(e) => setMenuInputs((prev) => ({ ...prev, [vendor.id]: { name: prev[vendor.id]?.name || "", price: e.target.value } }))} 
                            placeholder="如：90" 
                            className="w-full border-none px-5 py-4 rounded-xl font-bold shadow-sm outline-none focus:ring-2 focus:ring-blue-500" 
                          />
                        </div>
                        <button onClick={() => addMenu(vendor.id)} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-xl font-black shadow-md transition-all active:scale-95">
                          {editingMenu?.vendorId === vendor.id ? "儲存餐點修改" : "確認新增餐點"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}
