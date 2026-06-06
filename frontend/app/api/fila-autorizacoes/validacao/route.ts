import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {

  try {

    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'not_authenticated' }, { status: 401 });
    }

    const body = await req.json();

    const {
      id,
      forma_autorizacao
    } = body;

    const { error } = await supabase
      .from("fila_autorizacoes")
      .update({
        forma_autorizacao,
        validacao_finalizada_em: new Date().toISOString()
      })
      .eq("id", id);

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true
    });

  } catch (error: any) {

    return NextResponse.json({
      success: false,
      error: error.message
    }, {
      status: 500
    });
  }
}