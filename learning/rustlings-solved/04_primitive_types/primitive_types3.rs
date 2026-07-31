fn main() {
    let a = [0_i32; 100];
    if a.len() >= 100 {
        println!("Wow, that's a big array!");
    } else {
        panic!("Array not big enough, more elements needed");
    }
}
